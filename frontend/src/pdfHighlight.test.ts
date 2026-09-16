import {
  candidatesForPage,
  findHighlightRanges,
  findNormalizedRange,
  findSentenceSegments,
  normalizePage,
  renderTextItemHtml,
  SentenceSegment,
} from "./pdfHighlight";

const items = (...strs: string[]) => strs.map((str) => ({ str }));

/** Every segment on a page, in item then offset order. */
const allSegments = (segs: Map<number, SentenceSegment[]>): SentenceSegment[] => {
  const out: SentenceSegment[] = [];
  Array.from(segs.keys())
    .sort((a, b) => a - b)
    .forEach((key) => out.push(...segs.get(key)!));
  return out;
};

describe("pdf highlight matching", () => {
  test("plain sentence split across several text items", () => {
    const page = items("The study of ", "language use and ", "classroom interaction.");
    const r = findHighlightRanges(page, "The study of language use and classroom interaction.");
    expect(Array.from(r.keys())).toEqual([0, 1, 2]);
  });

  test("hyphenated line break in the PDF, rejoined in the sentence", () => {
    const page = items("Researchers are now draw-\ning upon a range of theoretical approaches today.");
    const r = findHighlightRanges(page, "Researchers are now drawing upon a range of theoretical approaches today.");
    expect(r.size).toBe(1);
  });

  test("citation present in PDF but stripped from the sentence", () => {
    const page = items(
      "As Krummheuer (2011) notes, ethnomethodological studies identify the structures of interaction.",
    );
    const r = findHighlightRanges(page, "As Krummheuer notes, ethnomethodological studies identify the structures of interaction.");
    const [start, end] = r.get(0)!;
    // The span must cover the citation too, not stop short at it.
    expect(start).toBe(0);
    expect(page[0].str.slice(start, end)).toContain("(2011)");
    expect(page[0].str.slice(start, end)).toContain("interaction");
  });

  test("collapsed whitespace and newlines", () => {
    const page = items("These  are\n  illustrated with   some key examples from research.");
    const r = findHighlightRanges(page, "These are illustrated with some key examples from research.");
    expect(r.size).toBe(1);
  });

  test("returns nothing when the sentence is not on the page", () => {
    const page = items("Completely unrelated content about marine biology and coral reefs.");
    const r = findHighlightRanges(page, "This article outlines the key principles an ethnomethodological approach follows.");
    expect(r.size).toBe(0);
  });

  test("fails closed on very short sentences", () => {
    const page = items("A page containing the word yes somewhere in it.");
    expect(findHighlightRanges(page, "Yes.").size).toBe(0);
  });

  test("picks a contiguous span, not scattered items", () => {
    const page = items("intro text ", "the key principles an ethnomethodological approach follows", " trailing text");
    const r = findHighlightRanges(page, "the key principles an ethnomethodological approach follows");
    expect(Array.from(r.keys())).toEqual([1]);
  });

  test("normalizePage maps every surviving char back to its item", () => {
    const page = normalizePage(items("ab, ", "cd!"));
    expect(page.norm).toBe("abcd");
    expect(Array.from(page.itemOf)).toEqual([0, 0, 1, 1]);
    expect(Array.from(page.offsetOf)).toEqual([0, 1, 0, 1]);
  });

  test("null sentence yields no ranges", () => {
    expect(findHighlightRanges(items("anything"), null).size).toBe(0);
  });

  test("range end never precedes start", () => {
    const page = normalizePage(items("some ordinary page text here for testing purposes"));
    const r = findNormalizedRange(page, "some ordinary page text here for testing purposes");
    expect(r).not.toBeNull();
    expect(r!.end).toBeGreaterThan(r!.start);
  });
});

describe("anchor robustness", () => {
  test("citation immediately after the opening words", () => {
    const page = items("As Krummheuer (2011) notes, ethnomethodological studies identify structures.");
    const r = findHighlightRanges(page, "As Krummheuer notes, ethnomethodological studies identify structures.");
    expect(r.size).toBe(1);
  });

  test("a short accidental anchor with no matching ending is rejected", () => {
    // "the study of" appears, but the rest of the sentence does not.
    const page = items("the study of marine biology in coastal waters around the northern islands");
    const r = findHighlightRanges(page, "the study of language use and classroom interaction within mathematics education");
    expect(r.size).toBe(0);
  });

  test("multiple citations across a long sentence", () => {
    const page = items(
      "Synthesized speech (Smith, 2019) can be created by concatenating pieces of recorded speech [3] that are stored in a database.",
    );
    const r = findHighlightRanges(page, "Synthesized speech can be created by concatenating pieces of recorded speech that are stored in a database.");
    const [s, e] = r.get(0)!;
    expect(page[0].str.slice(s, e)).toContain("(Smith, 2019)");
    expect(page[0].str.slice(s, e)).toContain("database");
  });
});

describe("sentence segments", () => {
  const S1 = "The study of language use and classroom interaction.";
  const S2 = "Researchers now draw upon a range of theoretical approaches.";

  test("two sentences inside one item get separate, ordered segments", () => {
    const page = items(`${S1} ${S2}`);
    const segs = findSentenceSegments(page, [
      { index: 0, text: S1 },
      { index: 1, text: S2 },
    ]);

    const list = segs.get(0)!;
    expect(list.map((s) => s.sentenceIndex)).toEqual([0, 1]);
    expect(list[0].to).toBeLessThanOrEqual(list[1].from);
    expect(page[0].str.slice(list[0].from, list[0].to)).toContain("classroom");
    expect(page[0].str.slice(list[1].from, list[1].to)).toContain("Researchers");
  });

  test("a sentence spanning three items yields one segment per item", () => {
    const page = items("The study of ", "language use and ", "classroom interaction.");
    const segs = findSentenceSegments(page, [{ index: 4, text: S1 }]);

    expect(Array.from(segs.keys())).toEqual([0, 1, 2]);
    segs.forEach((list) => {
      expect(list).toHaveLength(1);
      expect(list[0].sentenceIndex).toBe(4);
    });
  });

  test("a candidate that is not on the page contributes nothing", () => {
    const page = items(S1);
    const segs = findSentenceSegments(page, [
      { index: 0, text: S1 },
      { index: 1, text: "An entirely different sentence about marine biology." },
    ]);

    const all = allSegments(segs);
    expect(all.every((s) => s.sentenceIndex === 0)).toBe(true);
  });

  test("an overshooting tail is trimmed by the sentence that follows it", () => {
    // The first sentence's ending is missing from the page, so its match is
    // extended past where the second sentence actually starts.
    const truncated = "The study of language use and classroom interaction in schools today.";
    const page = items(`The study of language use and classroom interaction. ${S2}`);
    const segs = findSentenceSegments(page, [
      { index: 0, text: truncated },
      { index: 1, text: S2 },
    ]);

    const owned = (index: number) =>
      allSegments(segs).filter((s) => s.sentenceIndex === index);
    const first = owned(0);
    const second = owned(1);

    expect(second.length).toBeGreaterThan(0);
    expect(first[first.length - 1].to).toBeLessThanOrEqual(second[0].from);
    expect(page[0].str.slice(second[0].from, second[0].to)).toContain("Researchers");
  });

  test("a segment still spans a citation deleted from the sentence", () => {
    const page = items(
      "Synthesized speech (Smith, 2019) can be created by concatenating pieces of recorded speech [3] that are stored in a database.",
    );
    const segs = findSentenceSegments(page, [
      {
        index: 0,
        text: "Synthesized speech can be created by concatenating pieces of recorded speech that are stored in a database.",
      },
    ]);

    const [{ from, to }] = segs.get(0)!;
    expect(page[0].str.slice(from, to)).toContain("(Smith, 2019)");
    expect(page[0].str.slice(from, to)).toContain("database");
  });

  test("segments carry the app's sentence indices, not candidate positions", () => {
    const page = items(`${S1} ${S2}`);
    const segs = findSentenceSegments(page, [
      { index: 7, text: S1 },
      { index: 12, text: S2 },
    ]);

    expect(allSegments(segs).map((s) => s.sentenceIndex).sort((a, b) => a - b)).toEqual([7, 12]);
  });

  test("empty inputs yield no segments", () => {
    expect(findSentenceSegments([], [{ index: 0, text: S1 }]).size).toBe(0);
    expect(findSentenceSegments(items(S1), []).size).toBe(0);
    expect(findSentenceSegments(items(S1), [{ index: 0, text: "" }]).size).toBe(0);
  });

  test("findHighlightRanges still equals the merged bounds of one candidate", () => {
    const page = items("The study of ", "language use and ", "classroom interaction.");
    const ranges = findHighlightRanges(page, S1);
    const segs = findSentenceSegments(page, [{ index: 0, text: S1 }]);

    segs.forEach((list, itemIndex) => {
      expect(ranges.get(itemIndex)).toEqual([list[0].from, list[list.length - 1].to]);
    });
    expect(ranges.size).toBe(segs.size);
  });
});

describe("text item markup", () => {
  const seg = (from: number, to: number, sentenceIndex: number): SentenceSegment => ({
    from,
    to,
    sentenceIndex,
  });

  test("no segments leaves the text escaped and unwrapped", () => {
    expect(renderTextItemHtml('a & b < c', undefined)).toBe("a &amp; b &lt; c");
  });

  test("text inside and outside a segment is escaped", () => {
    const html = renderTextItemHtml('x & <y> z', [seg(4, 7, 3)]);
    expect(html).toBe(
      'x &amp; <mark class="pdf-sentence" data-sentence-index="3">&lt;y&gt;</mark> z',
    );
  });

  test("two segments in one item keep the text between them", () => {
    const html = renderTextItemHtml("one two three", [seg(0, 3, 1), seg(8, 13, 2)]);
    expect(html).toBe(
      '<mark class="pdf-sentence" data-sentence-index="1">one</mark> two ' +
        '<mark class="pdf-sentence" data-sentence-index="2">three</mark>',
    );
  });

  test("a segment reaching past the item is clamped, not truncated", () => {
    // `str` can be one frame ahead of the items the segments were built from.
    const html = renderTextItemHtml("short", [seg(2, 99, 0)]);
    expect(html).toBe(
      'sh<mark class="pdf-sentence" data-sentence-index="0">ort</mark>',
    );
  });
});

describe("page candidates", () => {
  const sentences = ["a", "b", "c", "d", "e", "f"];
  const pages = [1, 1, 1, 2, 2, 3];

  test("takes the page's own sentences plus the tail of the one before", () => {
    const got = candidatesForPage(sentences, pages, 2);
    expect(got.map((c) => c.index)).toEqual([1, 2, 3, 4]);
    expect(got.map((c) => c.text)).toEqual(["b", "c", "d", "e"]);
  });

  test("the first page has nothing to look behind at", () => {
    expect(candidatesForPage(sentences, pages, 1).map((c) => c.index)).toEqual([0, 1, 2]);
  });

  test("without usable page data every sentence is a candidate", () => {
    // The matcher fails closed, so this is only slower - never wrong. Skipping
    // it would lose the highlight entirely on such a document.
    expect(candidatesForPage(sentences, [], 2).map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(candidatesForPage(sentences, [1, 1], 2)).toHaveLength(sentences.length);
  });
});
