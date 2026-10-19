/**
 * Placing every sentence of a page at once, and cutting the result into the
 * per-item runs the text layer is rendered from.
 */

import { findNormalizedRange, SentenceRange } from "./match";
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

/** A place in the text: an item, and an offset within its `str`. */
interface TextPosition {
  item: number;
  offset: number;
}

// Built at runtime: TypeScript rejects a /u literal for an ES5 target.
const LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u");

const CLOSERS = `)\\]}"'\u201d\u2019\u00bb,;:`;
/**
 * What may follow a sentence's last word and still belong to it: closing
 * punctuation, the citations the splitter deletes ("(Trninic, 2018)", "[3]",
 * as in sentence_splitter.py), and the full stop.
 */
const ENDING_RE = new RegExp(
  `^[${CLOSERS}]*` +
    `(?:\\s*(?:\\([^()]*\\b(?:19|20)\\d{2}\\b[^()]*\\)|\\[\\s*\\d+(?:\\s*[-,]\\s*\\d+)*\\s*\\]))*` +
    `[${CLOSERS}]*(?:\\s*[.!?][${CLOSERS}]*)*`,
);
/** How far past a sentence's last word its ending is looked for. */
const ENDING_LOOKAHEAD = 240;

/**
 * Whether two items sit on the same line: their baselines, measured across the
 * text's direction, within half the larger one's type size of each other - so
 * a superscript note mark, raised in smaller type, is still in its line. Items
 * without geometry count as one line.
 */
function sameLine(a: PdfTextItem, b: PdfTextItem): boolean {
  if (!a.transform || !b.transform) return true;
  const [ax, bx, cx, dx, x1, y1] = a.transform;
  const [, , c2, d2, x2, y2] = b.transform;
  const scale = Math.hypot(ax, bx) || 1;
  const across = (x: number, y: number) => (-bx * x + ax * y) / scale;
  const size = Math.max(Math.hypot(cx, dx), Math.hypot(c2, d2));
  return Math.abs(across(x1, y1) - across(x2, y2)) < size / 2;
}

/**
 * Where a sentence really ends, given where its last word does: past what
 * ENDING_RE allows to follow it, but never beyond `limit`, where the next
 * sentence starts.
 */
function extendOverEnding(
  items: PdfTextItem[],
  end: TextPosition,
  limit: TextPosition,
): TextPosition {
  let text = "";
  const places: TextPosition[] = [];
  for (let item = end.item; item <= limit.item && text.length < ENDING_LOOKAHEAD; item += 1) {
    const str = items[item].str ?? "";
    const to = item === limit.item ? limit.offset : str.length;
    for (let offset = item === end.item ? end.offset : 0; offset < to; offset += 1) {
      text += str[offset];
      places.push({ item, offset });
    }
  }

  const kept = ENDING_RE.exec(text)![0].length;
  return kept === 0 ? end : { item: places[kept - 1].item, offset: places[kept - 1].offset + 1 };
}

/**
 * Every locatable sentence on the page, as per-item character runs.
 *
 * Each sentence is one continuous stretch, from its first word to its final
 * punctuation - spaces, punctuation and citations between included, so it
 * reads as a single highlight. The one exception is text set smaller than
 * the sentence that contains letters - a running head, a footer - which a
 * sentence crossing a page or a column runs straight past.
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

  const all = [...before, ...items, ...after];
  // Item indices of this page within the combined text.
  const firstItem = before.length;
  const lastItem = before.length + items.length - 1;

  const page = normalizePage(all);
  if (page.norm.length === 0) return segments;

  const placed: (SentenceRange & { sentenceIndex: number })[] = [];
  const taken = new Set<number>();
  for (const candidate of candidates) {
    if (!candidate.text) continue;
    const range = findNormalizedRange(page, normalizeSentence(candidate.text), {
      requireTail: candidate.lookbehind,
      taken,
    });
    if (range) {
      taken.add(range.start);
      placed.push({ ...range, sentenceIndex: candidate.index });
    }
  }

  // Two sentences can claim the same characters, because a match's end is far
  // less trustworthy than its start: anchoring is on the head, while the tail
  // is hunted in a window reaching well past the nominal length (and, for a
  // trusted head with no tail found, simply extended). Overshoot therefore
  // happens at the tail, so in start order each sentence is cut off where the
  // next begins, and never the other way round.
  placed.sort((a, b) => a.start - b.start || a.sentenceIndex - b.sentenceIndex);

  placed.forEach(({ start, end, pieces, sentenceIndex }, k) => {
    const next = placed[k + 1];
    const stop = Math.min(end, next ? next.start : end);
    if (stop <= start) return;

    const limit: TextPosition = next
      ? { item: page.itemOf[next.start], offset: page.offsetOf[next.start] }
      : { item: all.length - 1, offset: (all[all.length - 1].str ?? "").length };
    const from: TextPosition = { item: page.itemOf[start], offset: page.offsetOf[start] };
    const to = extendOverEnding(
      all,
      { item: page.itemOf[stop - 1], offset: page.endOf[stop - 1] },
      limit,
    );

    // The sentence's own text, as exported: the items holding characters
    // that lined up with it, plus its ending past the last word - on the line
    // the last word is on, or the line the ending finishes on. A citation
    // running over a page break thereby keeps both its halves, but not the
    // footer and running head between them.
    const own = new Set<number>();
    pieces.forEach(([pieceFrom, pieceTo]) => {
      for (let i = pieceFrom; i < Math.min(pieceTo, stop); i += 1) own.add(page.itemOf[i]);
    });
    const lastWord = page.itemOf[stop - 1];
    for (let item = lastWord; item <= to.item; item += 1) {
      if (sameLine(all[item], all[lastWord]) || sameLine(all[item], all[to.item])) own.add(item);
    }

    const add = (item: number) => {
      const segment: SentenceSegment = {
        from: item === from.item ? from.offset : 0,
        to: item === to.item ? to.offset : (all[item].str ?? "").length,
        sentenceIndex,
      };
      if (segment.to <= segment.from) return;
      const list = segments.get(item - firstItem);
      if (list) list.push(segment);
      else segments.set(item - firstItem, [segment]);
    };

    // This page's share runs from its first own item to its last, so the
    // footer and page number below it, or the running head above, stay out.
    // Between two own items, what the sentence does not say is filled when it
    // sits in the line - a citation, a note mark, punctuation - and left out
    // when it stands on a line of its own: a running head between columns.
    let previous = -1;
    for (let item = Math.max(from.item, firstItem); item <= Math.min(to.item, lastItem); item += 1) {
      if (!own.has(item)) continue;
      if (previous !== -1) {
        let standsApart = false;
        for (let i = previous + 1; i < item; i += 1) {
          const text = all[i].str ?? "";
          if (
            LETTER_OR_DIGIT.test(text) &&
            !sameLine(all[i], all[previous]) &&
            !sameLine(all[i], all[item])
          ) {
            standsApart = true;
          }
        }
        for (let i = previous + 1; i < item && !standsApart; i += 1) add(i);
      }
      add(item);
      previous = item;
    }
  });

  return segments;
}
