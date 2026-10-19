/**
 * The text layer's side of highlighting: markup for one text item, and the
 * classes and selectors the viewer uses to light marks up in the live DOM.
 */

import { SentenceSegment } from "./segments";

/** On every mark of the sentence being narrated. */
export const ACTIVE_CLASS = "pdf-sentence--active";
/** On every mark of the sentence under the pointer. */
export const HOVER_CLASS = "pdf-sentence--hover";

/**
 * Every sentence mark, or only those of sentence `index`. The sentence list
 * uses the same data attribute on its rows, so callers must scope the query
 * to the PDF.
 */
export function sentenceSelector(index?: number): string {
  return index === undefined
    ? "mark[data-sentence-index]"
    : `mark[data-sentence-index="${Number(index)}"]`;
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
