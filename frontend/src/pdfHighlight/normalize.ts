/**
 * Reducing text to what the matcher compares: lowercased letters and digits.
 *
 * That alone neutralises the splitter's hyphen rejoins, its whitespace
 * collapse and every punctuation difference. Characters are also decomposed
 * first (NFKD), so ligatures read as their letters ("ﬁ" -> "fi") and accents
 * drop away ("é" -> "e") - consistently on both sides, whichever of them the
 * PDF or the splitter happened to use.
 */

export interface PdfTextItem {
  str: string;
}

export interface NormalizedPage {
  /** Normalised characters from every item, concatenated. */
  norm: string;
  /** For each character in `norm`, the index of the item it came from. */
  itemOf: Int32Array;
  /** For each character in `norm`, where its source character starts in that item's `str`. */
  offsetOf: Int32Array;
  /** For each character in `norm`, the offset just past its source character. */
  endOf: Int32Array;
}

// Built at runtime: TypeScript rejects a /u literal for an ES5 target.
const LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u");

/**
 * Calls `keep` with each normalised character of `str` and the span of the
 * source character it came from. One source character can yield several
 * ("ﬁ") or none (punctuation, combining accents).
 *
 * Works a character at a time, so a character whose lowercase or
 * decomposition is longer than itself ("İ") cannot shift later offsets.
 */
function forEachNormalized(
  str: string,
  keep: (char: string, from: number, to: number) => void,
): void {
  let from = 0;
  while (from < str.length) {
    const code = str.charCodeAt(from);

    // ASCII is nearly all text and needs no decomposition.
    if (code < 128) {
      if ((code >= 48 && code <= 57) || (code >= 97 && code <= 122)) {
        keep(str[from], from, from + 1);
      } else if (code >= 65 && code <= 90) {
        keep(String.fromCharCode(code + 32), from, from + 1);
      }
      from += 1;
      continue;
    }

    // Keep a surrogate pair together, so its span is the whole character.
    const to =
      code >= 0xd800 && code <= 0xdbff && from + 1 < str.length
        ? from + 2
        : from + 1;
    const decomposed = str.slice(from, to).normalize("NFKD").toLowerCase();
    for (let i = 0; i < decomposed.length; i += 1) {
      if (LETTER_OR_DIGIT.test(decomposed[i])) keep(decomposed[i], from, to);
    }
    from = to;
  }
}

/**
 * Flattens a page's text items into a searchable string, remembering where
 * every surviving character came from.
 */
export function normalizePage(items: PdfTextItem[]): NormalizedPage {
  const chars: string[] = [];
  const itemOf: number[] = [];
  const offsetOf: number[] = [];
  const endOf: number[] = [];

  items.forEach((item, itemIndex) => {
    forEachNormalized(item?.str ?? "", (char, from, to) => {
      chars.push(char);
      itemOf.push(itemIndex);
      offsetOf.push(from);
      endOf.push(to);
    });
  });

  return {
    norm: chars.join(""),
    itemOf: Int32Array.from(itemOf),
    offsetOf: Int32Array.from(offsetOf),
    endOf: Int32Array.from(endOf),
  };
}

/** Same reduction, for the sentence being searched for. */
export function normalizeSentence(sentence: string): string {
  const chars: string[] = [];
  forEachNormalized(sentence, (char) => chars.push(char));
  return chars.join("");
}
