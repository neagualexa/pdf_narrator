/**
 * Locating one sentence inside a normalised page.
 *
 *  1. Anchor on the sentence's opening characters, which the splitter rarely
 *     touches, falling back to progressively shorter anchors.
 *  2. Find the sentence's closing characters after that anchor to fix the end.
 *     The matched span is allowed to be *longer* than the sentence, because
 *     deleted citations still occupy space in the PDF.
 *  3. Within that span, find what the sentence never says - a running head
 *     the sentence ran across - so it can be left unlit.
 *
 * What it deliberately does not do is fuzzy edit-distance matching: the anchor
 * approach is cheaper, and a wrong highlight is worse than none, so every step
 * fails closed.
 *
 * Every function here takes the sentence already normalised (`target`), so a
 * caller normalises it once for all of them.
 */

import { NormalizedPage } from "./normalize";

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

/**
 * Where the sentence's ending can start, as a multiple of its length past the
 * anchor. The window reaches well past the nominal length, because the span
 * is considerably longer than the sentence wherever a citation was removed.
 */
const TAIL_SEARCH_FROM = 0.5;
const TAIL_SEARCH_TO = 2.5;
/** Extra reach for the ending, so short sentences can still span a citation. */
const TAIL_SEARCH_PAD = 64;

/** Every position `needle` occurs at in `haystack`, overlapping ones included. */
function occurrencesOf(haystack: string, needle: string): number[] {
  const found: number[] = [];
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + 1)
  ) {
    found.push(at);
  }
  return found;
}

/** Shortest piece of a split ending that counts towards confirming it. */
const TAIL_MIN_PIECE = 6;
/**
 * Most text a split ending may straddle: a page's footer and the next page's
 * running head, or a citation among the last few words.
 */
const TAIL_MAX_GAP = 240;

/**
 * The end of the sentence anchored at `start`, found by its closing
 * characters, or -1 if they are not within reach.
 *
 * The closing characters may come in two pieces with other text between them
 * - "...a system of sensory" at the foot of one page and "corrections." at
 * the top of the next, with the footer and the next page's head between.
 */
function findTail(norm: string, target: string, start: number): number {
  const tail = target.slice(target.length - Math.min(TAIL_LENGTH, target.length));
  const searchFrom = start + Math.floor(target.length * TAIL_SEARCH_FROM);
  const searchTo = Math.min(
    norm.length,
    start + Math.ceil(target.length * TAIL_SEARCH_TO) + TAIL_SEARCH_PAD,
  );
  if (searchTo <= searchFrom) return -1;

  const window = norm.slice(searchFrom, searchTo);
  const at = window.indexOf(tail);
  if (at !== -1) return searchFrom + at + tail.length;

  for (let split = TAIL_MIN_PIECE; split <= tail.length - TAIL_MIN_PIECE; split += 1) {
    const head = tail.slice(0, split);
    const rest = tail.slice(split);

    for (const found of occurrencesOf(window, head)) {
      const gapFrom = searchFrom + found + head.length;
      const restAt = norm
        .slice(gapFrom, gapFrom + TAIL_MAX_GAP + rest.length)
        .indexOf(rest);
      if (restAt !== -1) return gapFrom + restAt + rest.length;
    }
  }
  return -1;
}

/**
 * Offsets into the sentence to anchor at when its opening is interrupted. One
 * of them must land past the interruption, so they reach a few words in.
 */
const SPLIT_ANCHOR_OFFSETS = [4, 8, 12, 16, 20, 24, 32];
const SPLIT_ANCHOR_LENGTH = 24;
/** Shortest stretch of the opening accepted before a split anchor. */
const SPLIT_MIN_OPENING = 4;
/** How much text - a citation - may sit between the opening and the anchor. */
const SPLIT_MAX_GAP = 48;

/**
 * The span of a sentence whose opening is interrupted in the page, or null.
 *
 * Anchors on a stretch a few characters into the sentence, then looks just
 * before it for as much of the sentence's opening as is there unbroken
 * ("smith" ahead of "1910showedthatchildren..."). Short as that opening may
 * be, the result needs the anchor, the opening and the ending all to line up.
 */
function findSplitOpening(
  norm: string,
  target: string,
  free: (at: number) => boolean,
): { start: number; end: number } | null {
  for (const offset of SPLIT_ANCHOR_OFFSETS) {
    if (offset + SPLIT_ANCHOR_LENGTH > target.length) break;
    const anchor = target.slice(offset, offset + SPLIT_ANCHOR_LENGTH);

    for (const at of occurrencesOf(norm, anchor)) {
      const reach = norm.slice(Math.max(0, at - offset - SPLIT_MAX_GAP), at);

      // The longest opening wins: it is the most distinctive, and the last
      // occurrence is the one nearest the anchor.
      for (let length = offset; length >= SPLIT_MIN_OPENING; length -= 1) {
        const found = reach.lastIndexOf(target.slice(0, length));
        if (found === -1) continue;

        const start = at - reach.length + found;
        const end = free(start) ? findTail(norm, target, start) : -1;
        if (end > at) return { start, end };
        break;
      }
    }
  }
  return null;
}

/**
 * The span of `page.norm` covered by the normalised sentence `target`, or
 * null when it cannot be located confidently.
 *
 * `taken` holds start positions other sentences have already claimed, so a
 * sentence that occurs twice on a page gets one copy per occurrence rather
 * than both landing on the first.
 */
export function findNormalizedRange(
  page: NormalizedPage,
  target: string,
  {
    requireTail = false,
    taken,
  }: { requireTail?: boolean; taken?: ReadonlySet<number> } = {},
): { start: number; end: number } | null {
  if (target.length < MIN_MATCHABLE || page.norm.length === 0) return null;

  const free = (at: number) => !taken?.has(at);

  // 0. A verbatim match needs no anchoring and is the most trustworthy result
  //    there is, whatever the sentence's length. Short captions and reference
  //    fragments - which the anchor path below rejects for lacking a
  //    distinctive head - usually land here.
  const exact = occurrencesOf(page.norm, target).find(free);
  if (exact !== undefined) return { start: exact, end: exact + target.length };

  // 1. Anchor on the opening characters, shortening until something matches,
  //    and confirm each anchor by finding the closing characters after it.
  //    Every occurrence is tried: the first is often a decoy - a running head
  //    or section title sharing the sentence's opening words - and the real
  //    sentence comes later on the page.
  let unconfirmed = -1;

  for (const length of HEAD_LENGTHS) {
    const head = target.slice(0, Math.min(length, target.length));
    if (head.length < MIN_MATCHABLE) break;

    for (const start of occurrencesOf(page.norm, head).filter(free)) {
      const end = findTail(page.norm, target, start);
      if (end > start) return { start, end };

      // A long anchor is distinctive enough to stand alone, but only once no
      // anchor anywhere could be confirmed.
      if (unconfirmed === -1 && head.length >= TRUSTED_HEAD) unconfirmed = start;
    }
  }

  // 2. A citation straight after the first word or two ("Smith (2010) showed
  //    that ...") breaks every opening above. Anchor past it instead, and
  //    find the opening just before.
  const split = findSplitOpening(page.norm, target, free);
  if (split) return split;

  // 3. Nothing confirmed a match. A short anchor alone is not evidence, so
  //    fail closed rather than highlight the wrong passage.
  if (requireTail || unconfirmed === -1) return null;

  const end = Math.min(page.norm.length, unconfirmed + target.length);
  return end > unconfirmed ? { start: unconfirmed, end } : null;
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
