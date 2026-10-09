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
 *
 * "Horizontal" means along the text's own direction, not the page's x axis.
 * Scans are often stored sideways and turned upright by the page's /Rotate,
 * so every run's matrix is rotated too (words advance along +y and lines step
 * along x). Each run is therefore projected into its own text frame first,
 * and runs of different orientations are laid out separately.
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
/**
 * Separates a page's layout blocks (columns, sideways text) in rendered text.
 * Each block has its own first and last line, which is where a running head
 * sits on a two-column or two-page-spread layout; `stripRunningHeads` reads
 * the blocks off this and turns it into a paragraph break.
 */
export const BLOCK_BREAK = "\f";

interface Run {
  str: string;
  /** Position along the text direction. */
  x: number;
  /** Position across it, increasing towards the top of the line stack. */
  y: number;
  width: number;
  size: number;
  /** Text direction in whole degrees, so runs can be grouped by orientation. */
  angle: number;
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

  // Rotate the origin into the run's own frame: `dir` is the way the text
  // advances, and `up` is perpendicular to it, pointing from one line to the
  // one above. For upright text this is the identity.
  const theta = Math.atan2(b, a);
  const dir = [Math.cos(theta), Math.sin(theta)];
  const up = [-dir[1], dir[0]];

  return {
    str: item.str,
    x: x * dir[0] + y * dir[1],
    y: x * up[0] + y * up[1],
    // pdf.js reports width as the advance along the text, whatever the angle.
    width: item.width ?? 0,
    size,
    angle: Math.round((theta * 180) / Math.PI),
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
 * Whether any of a run overlaps the page's visible area (its crop box).
 *
 * Scans of a two-page book spread are often cropped down to one page, leaving
 * the other page's OCR text in the file but off the page. The viewer neither
 * shows it nor, from pdf.js 4 on, returns it as text - so narrating it would
 * read out text nobody can see, and those sentences could never be found to
 * highlight.
 *
 * The run's whole extent is tested, not just its origin: leading whitespace
 * can park the origin well outside the page ("\t14A" starting at x=0).
 */
function isInView(item: TextItem, view?: number[]): boolean {
  if (!view || view.length < 4) return true;

  const [a, b, c, d, x, y] = item.transform;
  const advance = Math.hypot(a, b) || 1;
  const rise = Math.hypot(c, d) || 1;
  const width = item.width ?? 0;
  const height = Math.min(Math.abs(item.height ?? 0), rise) || rise;

  // The run's corners: origin, end of the advance, and both raised by its height.
  const along = [(a / advance) * width, (b / advance) * width];
  const up = [(c / rise) * height, (d / rise) * height];
  const xs = [x, x + along[0], x + up[0], x + along[0] + up[0]];
  const ys = [y, y + along[1], y + up[1], y + along[1] + up[1]];

  const [x0, y0, x1, y1] = view;
  return (
    Math.max(...xs) > Math.min(x0, x1) &&
    Math.min(...xs) < Math.max(x0, x1) &&
    Math.max(...ys) > Math.min(y0, y1) &&
    Math.min(...ys) < Math.max(y0, y1)
  );
}

/**
 * Reconstruct a page's text from its pdf.js text content.
 */
export function renderTextContent(
  textContent: { items: TextItem[] },
  view?: number[]
): string {
  const runs = textContent.items
    .filter((item) => isInView(item, view))
    .map(toRun)
    .filter((run): run is Run => run !== null);

  // Coordinates from different frames cannot be compared, so each orientation
  // is laid out on its own - the body first, then any sideways margin text.
  const byAngle = new Map<number, Run[]>();
  for (const run of runs) {
    const group = byAngle.get(run.angle);
    if (group) group.push(run);
    else byAngle.set(run.angle, [run]);
  }

  return Array.from(byAngle.values())
    .sort((p, q) => q.length - p.length)
    .flatMap((group) => splitColumns(group).map(renderRuns))
    .filter(Boolean)
    .join(BLOCK_BREAK);
}

/** Narrowest empty band, in multiples of the body font size, that reads as a gutter. */
const GUTTER_MIN_RATIO = 1.5;
/** Share of lines allowed to bridge a gutter: titles and running heads spanning both columns. */
const GUTTER_CROSSING_SHARE = 0.15;
/** Share of the text each side of a gutter must hold, so indents and bullets never split off. */
const COLUMN_MIN_SHARE = 0.2;
/** Lines each side of a gutter must hold; a short page has no room to prove a gutter. */
const COLUMN_MIN_LINES = 3;
/** Recursion limit for nested columns. */
const MAX_COLUMN_DEPTH = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function textLength(runs: Run[]): number {
  return runs.reduce((sum, r) => sum + r.str.trim().length, 0);
}

/**
 * The widest vertical band that almost no line puts text into, if one is wide
 * enough and has a real column on each side of it.
 */
function findGutter(lines: Run[][]): { from: number; to: number } | null {
  const runs = lines.flat();
  const minX = Math.min(...runs.map((r) => r.x));
  const maxX = Math.max(...runs.map((r) => r.x + r.width));
  const span = Math.ceil(maxX - minX);
  if (!(span > 0) || span > 10000) return null;

  // How many lines put ink into each one-unit slice of the page's width.
  const coverage = new Int32Array(span + 1);
  for (const line of lines) {
    const covered = new Uint8Array(span + 1);
    for (const r of line) {
      const from = Math.max(0, Math.floor(r.x - minX));
      const to = Math.min(span, Math.ceil(r.x + r.width - minX));
      covered.fill(1, from, to + 1);
    }
    covered.forEach((on, i) => (coverage[i] += on));
  }

  const allowed = Math.floor(lines.length * GUTTER_CROSSING_SHARE);
  const minWidth = median(runs.map((r) => r.size)) * GUTTER_MIN_RATIO;

  let best: { from: number; to: number } | null = null;
  let start = -1;
  for (let i = 0; i <= span + 1; i += 1) {
    const open = i <= span && coverage[i] <= allowed;
    if (open && start === -1) start = i;
    if (!open && start !== -1) {
      // A band touching either edge is margin, not a gutter.
      const inner = start > 0 && i <= span;
      if (inner && i - start >= minWidth && (!best || i - start > best.to - best.from)) {
        best = { from: minX + start, to: minX + i };
      }
      start = -1;
    }
  }
  if (!best) return null;

  const gutter = best;
  const left = runs.filter((r) => r.x + r.width <= gutter.from + 1);
  const right = runs.filter((r) => r.x >= gutter.to - 1);
  const total = textLength(runs);
  const linesWith = (side: Run[]) => groupIntoLines(side).length;

  const isColumn = (side: Run[]) =>
    textLength(side) >= total * COLUMN_MIN_SHARE &&
    linesWith(side) >= COLUMN_MIN_LINES;

  return isColumn(left) && isColumn(right) ? gutter : null;
}

/**
 * Split runs into blocks in reading order: columns left to right, with any
 * line that bridges the gutter (a title over both columns) kept whole and
 * placed between the column segments above and below it.
 *
 * This is what keeps a scanned two-page book spread, or a two-column paper,
 * from being read straight across both columns line by line.
 */
function splitColumns(runs: Run[], depth = 0): Run[][] {
  if (runs.length === 0) return [];
  if (depth >= MAX_COLUMN_DEPTH) return [runs];

  const lines = groupIntoLines(runs);
  const gutter = findGutter(lines);
  if (!gutter) return [runs];

  const bridges = (r: Run) => r.x < gutter.from && r.x + r.width > gutter.to;
  const isLeft = (r: Run) => r.x + r.width / 2 < (gutter.from + gutter.to) / 2;

  const blocks: Run[][] = [];
  let left: Run[] = [];
  let right: Run[] = [];
  let spanning: Run[] = [];

  const flushColumns = () => {
    blocks.push(...splitColumns(left, depth + 1), ...splitColumns(right, depth + 1));
    left = [];
    right = [];
  };

  for (const line of lines) {
    if (line.some(bridges)) {
      flushColumns();
      spanning.push(...line);
      continue;
    }
    if (spanning.length > 0) {
      blocks.push(spanning);
      spanning = [];
    }
    for (const r of line) (isLeft(r) ? left : right).push(r);
  }
  flushColumns();
  if (spanning.length > 0) blocks.push(spanning);

  return blocks.filter((block) => block.length > 0);
}

/** Lay out runs that all share one orientation. */
function renderRuns(runs: Run[]): string {
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

  return renderTextContent(textContent, pageData.view);
}

/** Share of pages a line must repeat on before it counts as a running head. */
const RUNNING_HEAD_SHARE = 0.25;
const RUNNING_HEAD_MIN_PAGES = 3;

/** Lines peeled off each end of a block: a page number can sit above its head. */
const RUNNING_HEAD_DEPTH = 2;
/** Shortest letters-only head that may be matched despite OCR misreads. */
const FUZZY_HEAD_MIN_LETTERS = 12;
/** Share of a head's letters OCR may have misread ("PATIERNS", "Af,TERNATIVE"). */
const FUZZY_HEAD_TOLERANCE = 0.15;

/** Page numbers differ per page, so compare lines with their digits masked. */
function headerKey(line: string): string {
  return line.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Letters only, for comparing heads that OCR has garbled differently. */
function letterKey(line: string): string {
  return line.toLowerCase().replace(/[^a-z]/g, "");
}

/** A line holding nothing but a page number, split from its head by OCR. */
function isBarePageNumber(line: string): boolean {
  return /^[^a-z0-9]*\d{1,4}[^a-z0-9]*$/i.test(line.trim());
}

/** Levenshtein distance, giving up (returning limit + 1) once past `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Drop running headers and footers from already-extracted page texts.
 *
 * A sentence that runs across a page break otherwise swallows the header of
 * the next page ("...to establish the weight of an Reflections 101 observation
 * or assertion"), which the narrator then reads aloud. A line is treated as a
 * running head only when it is the first or last line of its page and the same
 * line — page number aside — recurs on a good share of the other pages.
 *
 * Pages are split into their layout blocks first (see BLOCK_BREAK), since on
 * a scanned book spread the right-hand page's head is the first line of the
 * second column, not of the page.
 *
 * Scanned books need two allowances on top of that. OCR misreads the odd
 * head ("ALTERNATIVE PATIERNS"), so a line close enough to a head that does
 * repeat counts too. And it can split the page number onto a line of its
 * own, so bare page numbers are peeled off along with the head behind them.
 */
export function stripRunningHeads(pageTexts: string[]): string[] {
  const pages = pageTexts.map((text) => text.split(BLOCK_BREAK));
  const join = (blocks: string[]) =>
    blocks.map((block) => block.trim()).filter(Boolean).join("\n\n");

  if (pageTexts.length < RUNNING_HEAD_MIN_PAGES) return pages.map(join);

  const filledLines = (block: string) =>
    block
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.trim());

  const edgesOf = (block: string) => {
    const filled = filledLines(block);
    return [filled[0], filled[filled.length - 1]].filter(Boolean);
  };

  // Counted once per page, so two columns sharing a head cannot double it.
  const counts = new Map<string, number>();
  for (const blocks of pages) {
    const keys = new Set(
      blocks.flatMap(edgesOf).map(({ line }) => headerKey(line))
    );
    keys.forEach((key) => {
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  }

  const threshold = Math.max(
    RUNNING_HEAD_MIN_PAGES,
    pageTexts.length * RUNNING_HEAD_SHARE
  );

  // Only the confirmed heads are compared fuzzily: there are a handful of
  // them, where comparing every edge line with every other would be quadratic.
  const heads = Array.from(counts)
    .filter(([key, count]) => count >= threshold && key)
    .map(([key]) => letterKey(key))
    .filter((key) => key.length >= FUZZY_HEAD_MIN_LETTERS);

  const isRunningHead = (line: string) => {
    if ((counts.get(headerKey(line)) ?? 0) >= threshold) return true;

    const letters = letterKey(line);
    if (letters.length < FUZZY_HEAD_MIN_LETTERS) return false;
    return heads.some((head) => {
      const limit = Math.floor(
        Math.max(head.length, letters.length) * FUZZY_HEAD_TOLERANCE
      );
      return editDistance(letters, head, limit) <= limit;
    });
  };

  /** Indices of the head lines at one end of a block, outermost first. */
  const peel = (lines: { line: string; index: number }[]) => {
    const peeled: number[] = [];
    let sawHead = false;
    for (const { line, index } of lines.slice(0, RUNNING_HEAD_DEPTH)) {
      const isHead = isRunningHead(line);
      // A bare number is only a page number next to a head (or on its own at
      // the edge); a number further in is left to the text.
      if (!isHead && !(isBarePageNumber(line) && !sawHead)) break;
      peeled.push(index);
      sawHead = sawHead || isHead;
    }
    // A page number with no head beside it is only trusted at the very edge.
    return sawHead ? peeled : peeled.slice(0, 1);
  };

  return pages.map((blocks) =>
    join(
      blocks.map((block) => {
        const filled = filledLines(block);
        const dropped = new Set([
          ...peel(filled),
          ...peel([...filled].reverse()),
        ]);
        if (dropped.size === 0) return block;

        return block
          .split("\n")
          .filter((_, index) => !dropped.has(index))
          .join("\n");
      })
    )
  );
}
