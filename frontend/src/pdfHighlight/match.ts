/**
 * Locating one sentence inside a normalised page.
 *
 * The sentence is walked along the page from each place its opening occurs.
 * Wherever the two stop agreeing, the walk resumes at the nearest place they
 * agree again, skipping text on either side:
 *
 *  - on the page, what the sentence does not say: a citation the splitter
 *    deleted ("Smith (2010) showed"), or a page's footer and the next page's
 *    running head when the sentence crosses a page break;
 *  - in the sentence, what the page does not say: a vocabulary substitution
 *    ("&" read as "and") or a word OCR misread ("difected").
 *
 * A walk that reaches the sentence's last characters with most of it lined
 * up is a match. What it deliberately does not do is fuzzy edit-distance
 * matching: a wrong highlight is worse than none, so it fails closed.
 *
 * It takes the sentence already normalised (`target`), so a caller can
 * normalise it once.
 */

import { NormalizedPage } from "./normalize";

/** Below this many normalised characters a match is not distinctive enough. */
const MIN_MATCHABLE = 12;
/**
 * How much of the sentence's opening must appear unbroken where a walk
 * starts: enough for "Smith" before "(2010) showed that".
 */
const SEED = 5;
/** Shortest stretch that counts as the sentence and page agreeing again. */
const PIECE = 8;
/**
 * Most page text skipped at once: a citation, or what separates a sentence
 * crossing a page break - a footer, a running head, a figure's caption.
 */
const MAX_PAGE_SKIP = 600;
/** Most sentence text skipped at once: a substituted or misread word. */
const MAX_SENTENCE_SKIP = 16;
/** Share of the sentence that must line up for a walk to count. */
const MIN_LINED_UP = 0.75;
/**
 * An opening lined up unbroken for at least this long is distinctive enough
 * to trust when the walk cannot reach the ending - one cut off at the foot of
 * the last page; anything shorter is no evidence.
 */
const TRUSTED_OPENING = 24;

/** Where a sentence sits on the page, and which of it lined up with the sentence. */
export interface SentenceRange {
  start: number;
  end: number;
  /**
   * The stretches of `norm` [from, to) the sentence's own characters lined up
   * with. What lies between them is text the sentence does not say: a
   * citation, a note mark, or a page's footer and the next page's head.
   */
  pieces: [number, number][];
}

interface Walk {
  /** Just past the last page character lined up. */
  end: number;
  pieces: [number, number][];
  /** Characters of the sentence lined up. */
  linedUp: number;
  /** Length of the unbroken stretch at the start. */
  opening: number;
  /** Whether the walk lined up the sentence's last characters. */
  complete: boolean;
}

/** How far `norm` from `p` and `target` from `t` agree. */
function agreement(norm: string, p: number, target: string, t: number): number {
  let n = 0;
  while (t + n < target.length && norm[p + n] === target[t + n]) n += 1;
  return n;
}

/** Walks `target` along `norm`, its first character at `start`. */
function walk(norm: string, target: string, start: number): Walk {
  let p = start;
  let t = 0;
  let linedUp = 0;
  let opening = -1;
  const pieces: [number, number][] = [];

  for (;;) {
    const run = agreement(norm, p, target, t);
    if (run > 0) pieces.push([p, p + run]);
    p += run;
    t += run;
    linedUp += run;
    if (opening === -1) opening = run;
    if (t === target.length) return { end: p, pieces, linedUp, opening, complete: true };

    // Resume skipping as little of the sentence as possible, at a place
    // where the two then agree for long enough to be distinctive - otherwise
    // wherever they agree longest. Resuming nearest can land on a later word
    // that merely recurs nearby ("whole-class scaffolding" for "computer-based
    // scaffolding"); resuming where agreement is longest gives up words the
    // page does say ("and in some cases" before "these terms are...").
    const ahead = norm.slice(p, p + MAX_PAGE_SKIP + PIECE);
    let best = { run: 0, at: 0, skip: 0 };
    for (let skip = 0; skip <= MAX_SENTENCE_SKIP; skip += 1) {
      // The sentence's last piece may be short of a full one.
      const piece = target.substr(t + skip, PIECE);
      if (piece.length < SEED) break;
      const at = ahead.indexOf(piece);
      if (at === -1) continue;
      const resumed = agreement(norm, p + at, target, t + skip);
      const distinctive = resumed >= MIN_MATCHABLE || t + skip + resumed === target.length;
      if (distinctive) {
        best = { run: resumed, at, skip };
        break;
      }
      if (resumed > best.run) best = { run: resumed, at, skip };
    }
    if (best.run === 0) return { end: p, pieces, linedUp, opening, complete: false };
    p += best.at;
    t += best.skip;
  }
}

/**
 * The span of `page.norm` covered by the normalised sentence `target`, or
 * null when it cannot be located confidently.
 *
 * Of the walks that match, the one lining up most of the sentence wins, and
 * then the tightest: the opening's first occurrence is often a decoy - a
 * running head or section title sharing the sentence's opening words - whose
 * walk only reaches the sentence by skipping a long way.
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
): SentenceRange | null {
  const { norm } = page;
  if (target.length < MIN_MATCHABLE || norm.length === 0) return null;

  let best: (SentenceRange & { linedUp: number }) | null = null;
  let unconfirmed: { start: number; opening: number; pieces: [number, number][] } = {
    start: -1,
    opening: TRUSTED_OPENING - 1,
    pieces: [],
  };

  const opening = target.slice(0, SEED);
  for (let start = norm.indexOf(opening); start !== -1; start = norm.indexOf(opening, start + 1)) {
    if (taken?.has(start)) continue;

    const { end, pieces, linedUp, opening: unbroken, complete } = walk(norm, target, start);
    if (complete && linedUp >= target.length * MIN_LINED_UP) {
      if (
        !best ||
        linedUp > best.linedUp ||
        (linedUp === best.linedUp && end - start < best.end - best.start)
      ) {
        best = { start, end, pieces, linedUp };
      }
    } else if (unbroken > unconfirmed.opening) {
      unconfirmed = { start, opening: unbroken, pieces };
    }
  }

  if (best) return { start: best.start, end: best.end, pieces: best.pieces };

  // No walk reached the ending. The longest unbroken opening may stand alone
  // if it is long enough - the ending can be cut off at the foot of the last
  // page - but a short one is no evidence, so fail closed rather than
  // highlight the wrong passage.
  const { start, pieces } = unconfirmed;
  if (requireTail || start === -1) return null;
  return { start, end: pieces[pieces.length - 1][1], pieces };
}
