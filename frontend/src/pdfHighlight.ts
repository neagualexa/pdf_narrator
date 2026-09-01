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
    if (headUsed < TRUSTED_HEAD) return null;
    end = Math.min(page.norm.length, start + target.length);
  }

  return end > start ? { start, end } : null;
}

/**
 * Per-item character ranges to wrap, keyed by item index.
 *
 * Each item gets a single range spanning its first to last matched character,
 * so punctuation and spaces *inside* the sentence are highlighted too even
 * though they were dropped during normalisation.
 */
export function findHighlightRanges(
  items: PdfTextItem[],
  sentence: string | null | undefined,
): Map<number, [number, number]> {
  const ranges = new Map<number, [number, number]>();
  if (!sentence || items.length === 0) return ranges;

  const page = normalizePage(items);
  const range = findNormalizedRange(page, sentence);
  if (!range) return ranges;

  for (let i = range.start; i < range.end; i += 1) {
    const itemIndex = page.itemOf[i];
    const offset = page.offsetOf[i];
    const existing = ranges.get(itemIndex);

    if (existing) {
      existing[1] = offset + 1;
    } else {
      ranges.set(itemIndex, [offset, offset + 1]);
    }
  }

  return ranges;
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
