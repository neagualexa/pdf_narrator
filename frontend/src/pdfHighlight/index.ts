/**
 * Highlighting spoken sentences in the PDF's text layer.
 *
 * The sentence handed to the synthesiser is not the text in the PDF. By the
 * time `sentence_splitter.py` is done with it, it has had parenthetical
 * citations deleted, hyphenated line breaks rejoined, whitespace collapsed and
 * vocabulary substitutions applied ("e.g." -> "for example"). So an exact
 * search will not find it, and locating it takes several steps:
 *
 *  - `normalize`: reduce the page and the sentence to letters and digits.
 *  - `match`:     find the span of the page a sentence covers.
 *  - `segments`:  place every sentence of a page, resolve their overlaps and
 *                 cut each into one continuous run per text item.
 *  - `render`:    turn one text item and its runs into text-layer markup.
 */

export type { NormalizedPage, PdfTextItem } from "./normalize";
export { normalizePage, normalizeSentence } from "./normalize";
export { findNormalizedRange } from "./match";
export type {
  PageContext,
  SentenceCandidate,
  SentenceSegment,
} from "./segments";
export {
  MAX_CANDIDATES,
  candidatesForPage,
  findSentenceSegments,
} from "./segments";
export {
  ACTIVE_CLASS,
  HOVER_CLASS,
  escapeHtml,
  renderTextItemHtml,
  sentenceSelector,
} from "./render";
