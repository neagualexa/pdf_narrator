/**
 * Placing every sentence of a page at once, and cutting the result into the
 * per-item runs the text layer is rendered from.
 */

import { findInsertedItems, findNormalizedRange } from "./match";
import { normalizePage, normalizeSentence, PdfTextItem } from "./normalize";

export interface SentenceCandidate {
  /** Index into the app's `sentences` array - what playback is started with. */
  index: number;
  text: string;
  /**
   * Tagged to an earlier page, so only tried here in case the tagging is off.
   * Such a sentence is usually already highlighted on its own page, and its
   * opening recurring here is more likely a running head that shares its
   * words ("ALTERNATIVE PATTERNS OF COMMUNICATION 171" against a section
   * titled "Alternative Patterns of Communication in Mathematics Class"), so
   * it must be confirmed by its ending as well.
   */
  lookbehind?: boolean;
}

/** One contiguous run inside a single text item, owned by one sentence. */
export interface SentenceSegment {
  /** Offset within the item's `str`, inclusive. */
  from: number;
  /** Offset within the item's `str`, exclusive. */
  to: number;
  sentenceIndex: number;
}

/**
 * How many sentences of the previous page to also try. A sentence is tagged
 * with the page it *starts* on, so one can spill across the page break; this
 * is cheap insurance against an off-by-one in that tagging. It rarely matches
 * on the continuation page, since anchoring needs the sentence's opening.
 */
const PAGE_LOOKBEHIND = 2;

/**
 * Ceiling for the no-page-data fallback below, so a huge document cannot
 * stall a page turn. Sentences past it are never highlighted on such a
 * document.
 */
export const MAX_CANDIDATES = 1500;

/**
 * The sentences worth trying to locate on a 1-based page.
 *
 * Without usable page data the first `MAX_CANDIDATES` sentences are tried on
 * every page: the matcher fails closed, so what it does place is still right,
 * just found slowly. Skipping the fallback would instead lose the
 * active-sentence highlight on those documents entirely.
 */
export function candidatesForPage(
  sentences: string[],
  sentencePages: number[],
  page: number,
): SentenceCandidate[] {
  const toCandidate = (index: number, lookbehind = false): SentenceCandidate =>
    lookbehind
      ? { index, text: sentences[index], lookbehind }
      : { index, text: sentences[index] };

  if (sentencePages.length !== sentences.length) {
    return sentences
      .slice(0, MAX_CANDIDATES)
      .map((_, index) => toCandidate(index));
  }

  const previous: number[] = [];
  const current: number[] = [];

  for (let i = 0; i < sentences.length; i += 1) {
    if (sentencePages[i] === page) current.push(i);
    else if (sentencePages[i] === page - 1) previous.push(i);
  }

  return [
    ...previous.slice(-PAGE_LOOKBEHIND).map((index) => toCandidate(index, true)),
    ...current.map((index) => toCandidate(index)),
  ];
}

/** The text of the pages either side, for sentences that cross a page break. */
export interface PageContext {
  before?: PdfTextItem[];
  after?: PdfTextItem[];
}

/**
 * Every locatable sentence on the page, as per-item character runs.
 *
 * Runs within an item are sorted by `from` and never overlap, which is what
 * lets `renderTextItemHtml` emit its markup in a single pass.
 *
 * Sentences are matched against the neighbouring pages' text too, so one
 * that starts at the foot of a page and finishes overleaf is found whole -
 * on its own, neither page holds enough of it to be placed. Only this page's
 * runs are returned, keyed by this page's item indices.
 */
export function findSentenceSegments(
  items: PdfTextItem[],
  candidates: SentenceCandidate[],
  { before = [], after = [] }: PageContext = {},
): Map<number, SentenceSegment[]> {
  const segments = new Map<number, SentenceSegment[]>();
  if (items.length === 0 || candidates.length === 0) return segments;

  // Item indices of this page within the combined text.
  const firstItem = before.length;
  const lastItem = before.length + items.length - 1;

  const page = normalizePage([...before, ...items, ...after]);
  if (page.norm.length === 0) return segments;

  const placed: {
    start: number;
    end: number;
    sentenceIndex: number;
    skip: Set<number>;
  }[] = [];
  const taken = new Set<number>();
  for (const candidate of candidates) {
    if (!candidate.text) continue;
    const target = normalizeSentence(candidate.text);
    const range = findNormalizedRange(page, target, {
      requireTail: candidate.lookbehind,
      taken,
    });
    if (range) {
      taken.add(range.start);
      placed.push({
        ...range,
        sentenceIndex: candidate.index,
        skip: findInsertedItems(page, range, target),
      });
    }
  }

  if (placed.length === 0) return segments;

  // Two sentences can claim the same characters, because a match's end is far
  // less trustworthy than its start: anchoring is on the head, while the tail
  // is hunted in a window reaching well past the nominal length (and, for a
  // trusted head with no tail found, simply extended). Overshoot therefore
  // happens at the tail, so painting in start order lets a later sentence trim
  // its predecessor's overlong tail and never the other way round.
  placed.sort((a, b) => a.start - b.start || a.sentenceIndex - b.sentenceIndex);

  const owner = new Int32Array(page.norm.length).fill(-1);
  for (const { start, end, sentenceIndex, skip } of placed) {
    for (let i = start; i < end && i < owner.length; i += 1) {
      // Skipped text sits inside this sentence's span, so it belongs to no
      // sentence - not to a predecessor whose overlong tail reached it.
      owner[i] = skip.has(page.itemOf[i]) ? -1 : sentenceIndex;
    }
  }

  // Close a run whenever the owning sentence or the item changes. `itemOf` is
  // non-decreasing, so each item's runs are appended in increasing offset
  // order. Offsets are the item's own, so a run covers the punctuation and
  // spaces inside it that normalisation dropped.
  let runStart = -1;
  for (let i = 0; i <= owner.length; i += 1) {
    const continues =
      i < owner.length &&
      runStart !== -1 &&
      owner[i] === owner[runStart] &&
      page.itemOf[i] === page.itemOf[runStart];

    if (continues) continue;

    const runItem = runStart === -1 ? -1 : page.itemOf[runStart];
    if (
      runStart !== -1 &&
      owner[runStart] !== -1 &&
      runItem >= firstItem &&
      runItem <= lastItem
    ) {
      const itemIndex = runItem - firstItem;
      const list = segments.get(itemIndex);
      const segment: SentenceSegment = {
        from: page.offsetOf[runStart],
        to: page.endOf[i - 1],
        sentenceIndex: owner[runStart],
      };
      if (list) list.push(segment);
      else segments.set(itemIndex, [segment]);
    }

    runStart = i < owner.length ? i : -1;
  }

  return segments;
}
