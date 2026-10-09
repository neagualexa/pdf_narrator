/**
 * Locating a spoken sentence inside the PDF's raw text layer.
 *
 * The sentence handed to the synthesiser is not the text in the PDF. By the
 * time `sentence_splitter.py` is done with it, it has had parenthetical
 * citations deleted, hyphenated line breaks rejoined, whitespace collapsed and
 * vocabulary substitutions applied ("e.g." -> "for example"). So an exact
 * search will not find it.
 *
 * The approach here:
 *
 *  1. Reduce both sides to letters and digits only. That alone neutralises the
 *     hyphen rejoins, the whitespace collapse and all punctuation differences.
 *  2. Anchor on the sentence's opening characters, which the splitter rarely
 *     touches, falling back to progressively shorter anchors.
 *  3. Find the sentence's closing characters after that anchor to fix the end.
 *     The matched span is allowed to be *longer* than the sentence, because
 *     deleted citations still occupy space in the PDF.
 *
 * What it deliberately does not do is fuzzy edit-distance matching: the anchor
 * approach is cheaper, and a wrong highlight is worse than none, so every step
 * fails closed.
 */

/** Below this many normalised characters a match is not distinctive enough. */
const MIN_MATCHABLE = 12;

/**
 * Anchor lengths to try, longest first. Short anchors exist because a citation
 * can sit near the *start* of a sentence ("As Krummheuer (2011) notes, ...")
 * and corrupt any longer opening.
 */
const HEAD_LENGTHS = [48, 32, 24, 16, 12];

/**
 * An anchor at least this long is distinctive enough to trust on its own.
 * Anything shorter must be confirmed by finding the sentence's ending too,
 * or the match is discarded.
 */
const TRUSTED_HEAD = 24;

/** How many trailing characters are used to locate the end of the sentence. */
const TAIL_LENGTH = 24;

export interface PdfTextItem {
  str: string;
}

export interface NormalizedPage {
  /** Lowercased letters and digits from every item, concatenated. */
  norm: string;
  /** For each character in `norm`, the index of the item it came from. */
  itemOf: Int32Array;
  /** For each character in `norm`, its offset within that item's `str`. */
  offsetOf: Int32Array;
}

function isAlphanumeric(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 97 && code <= 122) // a-z (input is lowercased first)
  );
}

/**
 * Flattens a page's text items into a searchable string, remembering where
 * every surviving character came from.
 */
export function normalizePage(items: PdfTextItem[]): NormalizedPage {
  const chars: string[] = [];
  const itemOf: number[] = [];
  const offsetOf: number[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const str = items[itemIndex]?.str ?? "";
    const lower = str.toLowerCase();

    for (let offset = 0; offset < lower.length; offset += 1) {
      if (isAlphanumeric(lower.charCodeAt(offset))) {
        chars.push(lower[offset]);
        itemOf.push(itemIndex);
        offsetOf.push(offset);
      }
    }
  }

  return {
    norm: chars.join(""),
    itemOf: Int32Array.from(itemOf),
    offsetOf: Int32Array.from(offsetOf),
  };
}

/** Same reduction, for the sentence being searched for. */
export function normalizeSentence(sentence: string): string {
  let out = "";
  const lower = sentence.toLowerCase();
  for (let i = 0; i < lower.length; i += 1) {
    if (isAlphanumeric(lower.charCodeAt(i))) out += lower[i];
  }
  return out;
}

/**
 * The span of `page.norm` covered by `sentence`, or null when it cannot be
 * located confidently.
 */
export function findNormalizedRange(
  page: NormalizedPage,
  sentence: string,
  { requireTail = false }: { requireTail?: boolean } = {},
): { start: number; end: number } | null {
  const target = normalizeSentence(sentence);
  if (target.length < MIN_MATCHABLE || page.norm.length === 0) return null;

  // 0. A verbatim match needs no anchoring and is the most trustworthy result
  //    there is, whatever the sentence's length. Short captions and reference
  //    fragments - which the anchor path below rejects for lacking a
  //    distinctive head - usually land here.
  const exact = page.norm.indexOf(target);
  if (exact !== -1) return { start: exact, end: exact + target.length };

  // 1. Anchor on the opening characters, shortening until something matches.
  let start = -1;
  let headUsed = 0;

  for (const length of HEAD_LENGTHS) {
    const head = target.slice(0, Math.min(length, target.length));
    if (head.length < MIN_MATCHABLE) break;

    const at = page.norm.indexOf(head);
    if (at !== -1) {
      start = at;
      headUsed = head.length;
      break;
    }
  }

  if (start === -1) return null;

  // 2. Confirm and place the end using the closing characters. The span may be
  //    considerably longer than the sentence wherever a citation was removed,
  //    so the window reaches well past the nominal length.
  const tailLength = Math.min(TAIL_LENGTH, target.length);
  const tail = target.slice(target.length - tailLength);
  const searchFrom = start + Math.floor(target.length * 0.5);
  const searchTo = Math.min(
    page.norm.length,
    start + Math.ceil(target.length * 2.5) + 64,
  );

  let end = -1;
  if (searchTo > searchFrom) {
    const at = page.norm.slice(searchFrom, searchTo).indexOf(tail);
    if (at !== -1) end = searchFrom + at + tail.length;
  }

  if (end === -1) {
    // Nothing confirmed the match. A long anchor is distinctive enough to
    // stand alone; a short one is not, so fail closed rather than highlight
    // the wrong passage.
    if (requireTail || headUsed < TRUSTED_HEAD) return null;
    end = Math.min(page.norm.length, start + target.length);
  }

  return end > start ? { start, end } : null;
}

/** Length of the target slices `findInsertedItems` aligns with. */
const ALIGN_CHUNK = 6;
/** Furthest an aligned slice may sit past the last one: the longest insertion bridged. */
const ALIGN_MAX_GAP = 240;
/** Extra page characters a gap may hold over the sentence's before it counts as inserted. */
const ALIGN_SLACK = 3;
/**
 * Share of a gap's slices that must be absent from the sentence. Greedy
 * alignment can jump ahead over words the sentence does say, when the backend
 * read them in a different order; those words are still found in the sentence.
 */
const INSERTED_SHARE = 0.6;

/**
 * Text items inside a matched span that the sentence does not contain at all.
 *
 * A span is contiguous in the page's text, but the sentence need not be: one
 * that runs from the foot of one column to the head of the next has the next
 * column's running head and page number in the middle of it ("...the proposed
 * ALTERNATIVE PATTERNS OF COMMUNICATION 169 changes..."). The narrator never
 * says those, so they should not light up with the sentence either.
 *
 * The sentence is walked through the span in short slices. Wherever the page
 * holds clearly more text between two aligned slices than the sentence does,
 * that text was inserted; a gap about the size of the sentence's own is just
 * OCR misreading a word, and stays. A gap must also be mostly text the
 * sentence does not contain anywhere, so a misalignment over words that are
 * spoken - just read in another order - cannot punch a hole in the sentence.
 * Only items lying wholly inside an insertion are reported, so a citation
 * sharing an item with the sentence's own words keeps its highlight rather
 * than leaving a hole mid-line.
 */
export function findInsertedItems(
  page: NormalizedPage,
  range: { start: number; end: number },
  target: string,
): Set<number> {
  const inserted = new Set<number>();
  const { norm, itemOf } = page;

  // Aligned stretches, as [pageStart, targetStart, length].
  const aligned: [number, number, number][] = [];
  let p = range.start;
  let t = 0;
  while (t + ALIGN_CHUNK <= target.length && p < range.end) {
    const at = norm.indexOf(target.slice(t, t + ALIGN_CHUNK), p);
    if (at === -1 || at + ALIGN_CHUNK > range.end || at - p > ALIGN_MAX_GAP) {
      t += 1;
      continue;
    }
    let length = ALIGN_CHUNK;
    while (
      at + length < range.end &&
      t + length < target.length &&
      norm[at + length] === target[t + length]
    ) {
      length += 1;
    }
    aligned.push([at, t, length]);
    p = at + length;
    t += length;
  }

  // Too little lined up to tell an insertion from a misread: change nothing.
  const matched = aligned.reduce((sum, [, , length]) => sum + length, 0);
  if (matched < target.length * 0.5) return inserted;

  const candidates = new Set<number>();
  const markGap = (from: number, to: number) => {
    // Slice the gap the same way the sentence was aligned, and see how much of
    // it the sentence says anywhere at all.
    let pieces = 0;
    let foreign = 0;
    for (let i = from; i + ALIGN_CHUNK <= to; i += ALIGN_CHUNK) {
      pieces += 1;
      if (!target.includes(norm.slice(i, i + ALIGN_CHUNK))) foreign += 1;
    }
    if (pieces === 0 || foreign < pieces * INSERTED_SHARE) return;
    for (let i = from; i < to; i += 1) candidates.add(itemOf[i]);
  };

  for (let k = 1; k < aligned.length; k += 1) {
    const [prevPage, prevTarget, prevLength] = aligned[k - 1];
    const [nextPage, nextTarget] = aligned[k];
    const pageGap = nextPage - (prevPage + prevLength);
    const targetGap = nextTarget - (prevTarget + prevLength);
    if (pageGap > targetGap + ALIGN_SLACK) {
      markGap(prevPage + prevLength, nextPage);
    }
  }

  // An item counts only if none of its characters were aligned with the
  // sentence - every character of it in the span must lie inside a gap.
  const alignedItems = new Set<number>();
  for (const [at, , length] of aligned) {
    for (let i = at; i < at + length; i += 1) alignedItems.add(itemOf[i]);
  }
  candidates.forEach((item) => {
    if (!alignedItems.has(item)) inserted.add(item);
  });

  return inserted;
}

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

/** Ceiling for the no-page-data fallback below, so a huge document cannot stall a page turn. */
const MAX_CANDIDATES = 1500;

let warnedMissingPages = false;

/**
 * The sentences worth trying to locate on a 1-based page.
 *
 * Without usable page data every sentence is a candidate: the matcher fails
 * closed, so the result is still correct, just slower. Skipping the fallback
 * would instead lose the active-sentence highlight on those documents.
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
    if (!warnedMissingPages && sentences.length > MAX_CANDIDATES) {
      warnedMissingPages = true;
      console.warn(
        `No per-sentence page data; matching only the first ${MAX_CANDIDATES} sentences per page.`,
      );
    }
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

/**
 * Every locatable sentence on the page, as per-item character runs.
 *
 * Runs within an item are sorted by `from` and never overlap, which is what
 * lets `renderTextItemHtml` emit its markup in a single pass.
 */
export function findSentenceSegments(
  items: PdfTextItem[],
  candidates: SentenceCandidate[],
): Map<number, SentenceSegment[]> {
  const segments = new Map<number, SentenceSegment[]>();
  if (items.length === 0 || candidates.length === 0) return segments;

  const page = normalizePage(items);
  if (page.norm.length === 0) return segments;

  const placed: {
    start: number;
    end: number;
    sentenceIndex: number;
    skip: Set<number>;
  }[] = [];
  for (const candidate of candidates) {
    if (!candidate.text) continue;
    const range = findNormalizedRange(page, candidate.text, {
      requireTail: candidate.lookbehind,
    });
    if (range) {
      placed.push({
        ...range,
        sentenceIndex: candidate.index,
        skip: findInsertedItems(page, range, normalizeSentence(candidate.text)),
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

    if (runStart !== -1 && owner[runStart] !== -1) {
      const itemIndex = page.itemOf[runStart];
      const list = segments.get(itemIndex);
      const segment: SentenceSegment = {
        from: page.offsetOf[runStart],
        to: page.offsetOf[i - 1] + 1,
        sentenceIndex: owner[runStart],
      };
      if (list) list.push(segment);
      else segments.set(itemIndex, [segment]);
    }

    runStart = i < owner.length ? i : -1;
  }

  return segments;
}

/**
 * Per-item character ranges to wrap for a single sentence, keyed by item index.
 *
 * Each item gets one range spanning its first to last matched character, so
 * punctuation and spaces *inside* the sentence are covered too even though
 * they were dropped during normalisation.
 */
export function findHighlightRanges(
  items: PdfTextItem[],
  sentence: string | null | undefined,
): Map<number, [number, number]> {
  const ranges = new Map<number, [number, number]>();
  if (!sentence) return ranges;

  // A lone candidate cannot overlap anything, so its segments are exactly the
  // characters it matched, per item.
  const segments = findSentenceSegments(items, [{ index: 0, text: sentence }]);
  segments.forEach((list, itemIndex) => {
    ranges.set(itemIndex, [list[0].from, list[list.length - 1].to]);
  });

  return ranges;
}

/**
 * The markup for one text item: escaped text interleaved with one <mark> per
 * segment, each tagged with the sentence it belongs to.
 *
 * <mark> and not <span>: pdf.js absolutely positions every span inside the
 * text layer, which would tear a nested one out of its line. Whether a mark is
 * the playing sentence, or hovered, is decided by classes applied to the live
 * DOM instead - re-rendering this string would make react-pdf rebuild the
 * whole text layer.
 */
export function renderTextItemHtml(
  str: string,
  segments: SentenceSegment[] | undefined,
): string {
  if (!segments || segments.length === 0) return escapeHtml(str);

  let html = "";
  let cursor = 0;

  for (const segment of segments) {
    // `str` can be a frame ahead of the items the segments were built from, so
    // clamp rather than emit a truncated tag.
    const from = Math.max(cursor, Math.min(segment.from, str.length));
    const to = Math.max(from, Math.min(segment.to, str.length));
    if (to === from) continue;

    html += escapeHtml(str.slice(cursor, from));
    html += `<mark class="pdf-sentence" data-sentence-index="${Number(
      segment.sentenceIndex,
    )}">`;
    html += escapeHtml(str.slice(from, to));
    html += "</mark>";
    cursor = to;
  }

  return html + escapeHtml(str.slice(cursor));
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** react-pdf assigns the renderer's return value via innerHTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
