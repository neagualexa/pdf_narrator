/**
 * Layout-aware text extraction for pdf-parse / pdf.js pages.
 *
 * pdf.js hands us positioned text runs, not words: a scanned-then-OCRed PDF
 * typically emits one run per word with no space characters anywhere, and with
 * a baseline that jitters by a few points across a single visual line. Simply
 * concatenating `item.str` (pdf-parse's default) therefore glues words
 * together ("providegrounds"), and starting a new line whenever the baseline
 * changes shatters every line into fragments.
 *
 * So we rebuild the page from the geometry instead: cluster runs into lines by
 * baseline, order each line left to right, and insert a space wherever the
 * horizontal gap between two runs is wider than intra-word kerning.
 */

interface TextItem {
  str: string;
  width?: number;
  height?: number;
  transform: number[];
}

/**
 * Fraction of the font size a gap must exceed to count as a word space.
 * Deliberately tight: OCR run widths are approximations, so a genuine space
 * can measure as little as a tenth of the font size, while runs split inside a
 * word (font switches, kerning) sit at or below zero.
 */
const SPACE_GAP_RATIO = 0.1;
/** Fraction of the font size two baselines may differ by and still be one line. */
const LINE_TOLERANCE_RATIO = 0.5;
/** Multiple of the page's usual line spacing that reads as a paragraph break. */
const PARAGRAPH_GAP_RATIO = 1.5;

interface Run {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

function toRun(item: TextItem): Run | null {
  // Whitespace-only runs carry no text and often sit at bogus coordinates
  // (OCR layers like to park stray "\n"/"\t" runs at x=0); the spacing they
  // would have conveyed is recovered from the geometry below.
  if (!item.str || !item.str.trim()) return null;

  const [a, b, c, d, x, y] = item.transform;
  // Take the size from the text matrix's vertical scale rather than
  // `item.height`: some producers report a height that is the square of the
  // font size (a 10pt run arrives as 101.6), which would inflate both the
  // line tolerance and the word-space threshold enough to fold whole
  // paragraphs into one line and swallow the spaces between words.
  const size = Math.hypot(c, d) || Math.hypot(a, b) || Math.abs(item.height ?? 0) || 10;

  return {
    str: item.str,
    x,
    y,
    width: item.width ?? 0,
    size,
  };
}

function groupIntoLines(runs: Run[]): Run[][] {
  // Top to bottom, then left to right, so a line's runs arrive contiguously.
  const sorted = [...runs].sort((p, q) => q.y - p.y || p.x - q.x);

  const lines: Run[][] = [];
  let current: Run[] = [];
  let baseline = 0;

  for (const run of sorted) {
    const tolerance = Math.max(2, run.size * LINE_TOLERANCE_RATIO);

    if (current.length === 0 || Math.abs(run.y - baseline) <= tolerance) {
      current.push(run);
      // Track the running baseline so a line that drifts gradually (as OCR
      // baselines do) is not split halfway across the page.
      baseline = current.reduce((sum, r) => sum + r.y, 0) / current.length;
    } else {
      lines.push(current);
      current = [run];
      baseline = run.y;
    }
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

function joinLine(line: Run[]): string {
  const runs = [...line].sort((p, q) => p.x - q.x);

  let text = "";
  let prev: Run | null = null;

  for (const run of runs) {
    if (prev !== null) {
      const gap = run.x - (prev.x + prev.width);
      // Scale by the smaller of the two runs so an emphasised word set in a
      // taller face does not raise the bar for the space in front of it.
      const size = Math.min(prev.size, run.size);
      const needsSpace = gap > size * SPACE_GAP_RATIO;
      // Runs that already carry their own spacing must not be doubled up.
      if (needsSpace && !/\s$/.test(text) && !/^\s/.test(run.str)) {
        text += " ";
      }
    }
    text += run.str;
    prev = run;
  }

  // Runs whose own str carries padding can leave doubled spaces behind.
  return text.replace(/[ \t]{2,}/g, " ");
}

/**
 * Reconstruct a page's text from its pdf.js text content.
 */
export function renderTextContent(textContent: { items: TextItem[] }): string {
  const runs = textContent.items
    .map(toRun)
    .filter((run): run is Run => run !== null);

  if (runs.length === 0) return "";

  const lines = groupIntoLines(runs);
  const baselines = lines.map(
    (line) => line.reduce((sum, r) => sum + r.y, 0) / line.length
  );

  // Leading varies a lot between documents, so calibrate the paragraph break
  // against this page's own typical line spacing rather than the font size.
  const gaps = baselines.slice(1).map((y, i) => baselines[i] - y);
  const sortedGaps = [...gaps].sort((p, q) => p - q);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;

  let text = "";

  lines.forEach((line, i) => {
    if (i > 0) {
      const isParagraph =
        medianGap > 0 && gaps[i - 1] > medianGap * PARAGRAPH_GAP_RATIO;
      text += isParagraph ? "\n\n" : "\n";
    }
    text += joinLine(line);
  });

  return text;
}

/**
 * `pagerender` callback for pdf-parse.
 */
export async function renderPage(pageData: any): Promise<string> {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });

  return renderTextContent(textContent);
}

/** Share of pages a line must repeat on before it counts as a running head. */
const RUNNING_HEAD_SHARE = 0.25;
const RUNNING_HEAD_MIN_PAGES = 3;

/** Page numbers differ per page, so compare lines with their digits masked. */
function headerKey(line: string): string {
  return line.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Drop running headers and footers from already-extracted page texts.
 *
 * A sentence that runs across a page break otherwise swallows the header of
 * the next page ("...to establish the weight of an Reflections 101 observation
 * or assertion"), which the narrator then reads aloud. A line is treated as a
 * running head only when it is the first or last line of its page and the same
 * line — page number aside — recurs on a good share of the other pages.
 */
export function stripRunningHeads(pageTexts: string[]): string[] {
  if (pageTexts.length < RUNNING_HEAD_MIN_PAGES) return pageTexts;

  const counts = new Map<string, number>();
  const edges = pageTexts.map((text) => {
    const lines = text.split("\n");
    const filled = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.trim());
    return { first: filled[0], last: filled[filled.length - 1] };
  });

  for (const { first, last } of edges) {
    for (const line of new Set([first?.line, last?.line].filter(Boolean))) {
      const key = headerKey(line as string);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.max(
    RUNNING_HEAD_MIN_PAGES,
    pageTexts.length * RUNNING_HEAD_SHARE
  );
  const isRunningHead = (line?: string) =>
    !!line && (counts.get(headerKey(line)) ?? 0) >= threshold;

  return pageTexts.map((text, i) => {
    const { first, last } = edges[i];
    const dropped = new Set(
      [first, last]
        .filter((edge) => edge && isRunningHead(edge.line))
        .map((edge) => edge!.index)
    );

    if (dropped.size === 0) return text;

    return text
      .split("\n")
      .filter((_, index) => !dropped.has(index))
      .join("\n")
      .trim();
  });
}
