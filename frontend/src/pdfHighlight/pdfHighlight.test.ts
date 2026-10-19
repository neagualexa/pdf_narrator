import {
  candidatesForPage,
  findNormalizedRange,
  findSentenceSegments,
  normalizePage,
  normalizeSentence,
  PdfTextItem,
  renderTextItemHtml,
  SentenceSegment,
} from ".";

const items = (...strs: string[]) => strs.map((str) => ({ str }));

/** Every segment on a page, in item then offset order. */
const allSegments = (segs: Map<number, SentenceSegment[]>): SentenceSegment[] => {
  const out: SentenceSegment[] = [];
  Array.from(segs.keys())
    .sort((a, b) => a - b)
    .forEach((key) => out.push(...segs.get(key)!));
  return out;
};

/**
 * Where one sentence lands on a page, as each item's first to last matched
 * offset. A lone candidate cannot overlap anything, so this is exactly what
 * it matched.
 */
const highlightRanges = (page: PdfTextItem[], sentence: string): Map<number, [number, number]> => {
  const ranges = new Map<number, [number, number]>();
  findSentenceSegments(page, [{ index: 0, text: sentence }]).forEach((list, itemIndex) => {
    ranges.set(itemIndex, [list[0].from, list[list.length - 1].to]);
  });
  return ranges;
};

describe("pdf highlight matching", () => {
  test("plain sentence split across several text items", () => {
    const page = items("The study of ", "language use and ", "classroom interaction.");
    const r = highlightRanges(page, "The study of language use and classroom interaction.");
    expect(Array.from(r.keys())).toEqual([0, 1, 2]);
  });

  test("hyphenated line break in the PDF, rejoined in the sentence", () => {
    const page = items("Researchers are now draw-\ning upon a range of theoretical approaches today.");
    const r = highlightRanges(page, "Researchers are now drawing upon a range of theoretical approaches today.");
    expect(r.size).toBe(1);
  });

  test("citation present in PDF but stripped from the sentence", () => {
    const page = items(
      "As Krummheuer (2011) notes, ethnomethodological studies identify the structures of interaction.",
    );
    const r = highlightRanges(page, "As Krummheuer notes, ethnomethodological studies identify the structures of interaction.");
    const [start, end] = r.get(0)!;
    // The span must cover the citation too, not stop short at it.
    expect(start).toBe(0);
    expect(page[0].str.slice(start, end)).toContain("(2011)");
    expect(page[0].str.slice(start, end)).toContain("interaction");
  });

  test("collapsed whitespace and newlines", () => {
    const page = items("These  are\n  illustrated with   some key examples from research.");
    const r = highlightRanges(page, "These are illustrated with some key examples from research.");
    expect(r.size).toBe(1);
  });

  test("returns nothing when the sentence is not on the page", () => {
    const page = items("Completely unrelated content about marine biology and coral reefs.");
    const r = highlightRanges(page, "This article outlines the key principles an ethnomethodological approach follows.");
    expect(r.size).toBe(0);
  });

  test("fails closed on very short sentences", () => {
    const page = items("A page containing the word yes somewhere in it.");
    expect(highlightRanges(page, "Yes.").size).toBe(0);
  });

  test("picks a contiguous span, not scattered items", () => {
    const page = items("intro text ", "the key principles an ethnomethodological approach follows", " trailing text");
    const r = highlightRanges(page, "the key principles an ethnomethodological approach follows");
    expect(Array.from(r.keys())).toEqual([1]);
  });

  test("normalizePage maps every surviving char back to its item", () => {
    const page = normalizePage(items("ab, ", "cd!"));
    expect(page.norm).toBe("abcd");
    expect(Array.from(page.itemOf)).toEqual([0, 0, 1, 1]);
    expect(Array.from(page.offsetOf)).toEqual([0, 1, 0, 1]);
  });

  test("range end never precedes start", () => {
    const page = normalizePage(items("some ordinary page text here for testing purposes"));
    const r = findNormalizedRange(page, normalizeSentence("some ordinary page text here for testing purposes"));
    expect(r).not.toBeNull();
    expect(r!.end).toBeGreaterThan(r!.start);
  });
});

describe("anchor robustness", () => {
  test("citation immediately after the opening words", () => {
    const page = items("As Krummheuer (2011) notes, ethnomethodological studies identify structures.");
    const r = highlightRanges(page, "As Krummheuer notes, ethnomethodological studies identify structures.");
    expect(r.size).toBe(1);
  });

  test("a short accidental anchor with no matching ending is rejected", () => {
    // "the study of" appears, but the rest of the sentence does not.
    const page = items("the study of marine biology in coastal waters around the northern islands");
    const r = highlightRanges(page, "the study of language use and classroom interaction within mathematics education");
    expect(r.size).toBe(0);
  });

  test("multiple citations across a long sentence", () => {
    const page = items(
      "Synthesized speech (Smith, 2019) can be created by concatenating pieces of recorded speech [3] that are stored in a database.",
    );
    const r = highlightRanges(page, "Synthesized speech can be created by concatenating pieces of recorded speech that are stored in a database.");
    const [s, e] = r.get(0)!;
    expect(page[0].str.slice(s, e)).toContain("(Smith, 2019)");
    expect(page[0].str.slice(s, e)).toContain("database");
  });

  test("a running head sharing the opening does not steal the match", () => {
    // The head occurs first in the running head, where the ending does not
    // follow; the real sentence, interrupted by a citation, comes later.
    const page = items(
      "Alternative patterns of communication in mathematics 171 ",
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ",
      "Alternative patterns of communication in mathematics (Smith 2011) are studied in this short article here.",
    );
    const r = highlightRanges(
      page,
      "Alternative patterns of communication in mathematics are studied in this short article here.",
    );
    expect(Array.from(r.keys())).toEqual([2]);
  });

  test("a citation straight after the first word", () => {
    const page = items(
      "Earlier text. Smith (2010) showed that children learn best through guided participation with peers.",
    );
    const r = highlightRanges(page, "Smith showed that children learn best through guided participation with peers.");
    const [start, end] = r.get(0)!;
    expect(page[0].str.slice(start, end)).toMatch(/^Smith \(2010\) showed.*peers$/);
  });

  test("a citation a few words in, after a sentence split mid-reference", () => {
    const page = items(
      "Wood et al. (1976) and in Bruner (1975a, 1975b), appears to be a detailed and well-elaborated synthesis of these ideas.",
    );
    const r = highlightRanges(page, "and in Bruner, appears to be a detailed and wellelaborated synthesis of these ideas.");
    const [start, end] = r.get(0)!;
    expect(page[0].str.slice(start, end)).toMatch(/^and in Bruner \(1975a, 1975b\), appears.*ideas$/);
  });

  test("an interrupted opening still needs its ending", () => {
    const page = items(
      "Smith (2010) showed that children learn best through guided participation, and nothing else follows here at all.",
    );
    const r = highlightRanges(page, "Smith showed that children learn best through guided participation with peers in class.");
    expect(r.size).toBe(0);
  });

  test("an unconfirmed long anchor is used only when no anchor confirms", () => {
    // The ending is off the page entirely, so the trusted head stands alone.
    const page = items("The study of language use and classroom interaction began.");
    const r = highlightRanges(
      page,
      "The study of language use and classroom interaction in schools across many countries today.",
    );
    expect(r.size).toBe(1);
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

  test("a sentence repeated on the page gets one copy per occurrence", () => {
    const page = items(`${S1} Some unrelated words in between. ${S1}`);
    const segs = findSentenceSegments(page, [
      { index: 3, text: S1 },
      { index: 9, text: S1 },
    ]);

    const [first, second] = allSegments(segs);
    expect([first.sentenceIndex, second.sentenceIndex]).toEqual([3, 9]);
    expect(first.to).toBeLessThanOrEqual(second.from);
    expect(second.from).toBe(page[0].str.lastIndexOf(S1));
  });

  test("empty inputs yield no segments", () => {
    expect(findSentenceSegments([], [{ index: 0, text: S1 }]).size).toBe(0);
    expect(findSentenceSegments(items(S1), []).size).toBe(0);
    expect(findSentenceSegments(items(S1), [{ index: 0, text: "" }]).size).toBe(0);
  });
});

describe("text inserted into a sentence", () => {
  test("a running head between two columns is not part of the sentence", () => {
    const page = items(
      "In addition, the proposed",
      "ALTERNATIVE PATTERNS OF COMMUNICATION",
      "169",
      "changes currently advocated for reform in mathematics education sup-",
      "port a more dialogic view of communication (NCTM 1989, 1991).",
    );
    const sentence =
      "In addition, the proposed changes currently advocated for reform in mathematics education support a more dialogic view of communication.";
    const segs = findSentenceSegments(page, [{ index: 7, text: sentence }]);

    expect(Array.from(segs.keys()).sort()).toEqual([0, 3, 4]);
  });

  test("an OCR misread inside the sentence keeps its item highlighted", () => {
    const page = items(
      "The pattern of interaction ",
      "difected",
      " toward a specific response reflects a different stance.",
    );
    const sentence = "The pattern of interaction directed toward a specific response reflects a different stance.";
    const segs = findSentenceSegments(page, [{ index: 0, text: sentence }]);

    expect(Array.from(segs.keys()).sort()).toEqual([0, 1, 2]);
  });

  test("a citation sharing an item with the sentence keeps its highlight", () => {
    const page = items("Wertsch and Toma (1995) characterize communication in classrooms as univocal.");
    const sentence = "Wertsch and Toma characterize communication in classrooms as univocal.";
    const segs = findSentenceSegments(page, [{ index: 0, text: sentence }]);

    expect(segs.get(0)).toHaveLength(1);
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

  test("only the previous page's sentences are flagged as lookbehind", () => {
    const got = candidatesForPage(sentences, pages, 2);
    expect(got.map((c) => Boolean(c.lookbehind))).toEqual([true, true, false, false]);
  });

  test("a previous page's sentence needs its ending to match, not just its opening", () => {
    // The next page's running head shares the section title's opening words;
    // anchoring on them alone used to paint the head and the text after it.
    const sentence =
      "ALTERNATIVE PATTERNS OF COMMUNICATION IN MATHEMATICS CLASS Results from both quantitative and qualitative research indicate that students learn.";
    const page = items(
      "ALTERNATIVE PATTERNS OF COMMUNICATION",
      "171",
      "Jim: 15. Teacher: And 9 is one more than 8. So 15 plus one more is?",
    );

    expect(allSegments(findSentenceSegments(page, [{ index: 0, text: sentence, lookbehind: true }]))).toEqual([]);
    // Tagged to this page it is still trusted on its opening alone.
    expect(allSegments(findSentenceSegments(page, [{ index: 0, text: sentence }]))).not.toEqual([]);
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

describe("sentences crossing a page break", () => {
  // Modelled on a real paper: the sentence's first words close page 11, under
  // them the page's footer, and page 12 opens with its own head.
  const sentence =
    "Later, they met in Liege in July 1971; these meetings happened at the time when both of them were studying children's abilities at an early age.";
  const page11 = items(
    "the development of skilled movement in infancy and about Bernstein's research. ",
    "Later, they met in",
    "MIND, CULTURE, AND ACTIVITY",
    "13",
  );
  const page12 = items(
    "14",
    "A. SHVARTS AND A. BAKKER",
    "Liege in July 1971; these meetings happened at the time when both of them were studying children's",
    "abilities at an early age.",
    "14",
    "From the Luria-Bruner correspondence, we know that their discussions influenced Bruner's writing.",
  );
  const owned = (segs: Map<number, SentenceSegment[]>) =>
    Array.from(segs.keys()).sort((a, b) => a - b);

  test("neither page alone can place it", () => {
    expect(findSentenceSegments(page11, [{ index: 0, text: sentence }]).size).toBe(0);
    expect(
      findSentenceSegments(page12, [{ index: 0, text: sentence, lookbehind: true }]).size,
    ).toBe(0);
  });

  test("its opening lights up on the page it starts on", () => {
    const segs = findSentenceSegments(page11, [{ index: 0, text: sentence }], { after: page12 });
    expect(owned(segs)).toEqual([1]);
  });

  test("a sentence whose ending straddles the page break lights up on both pages", () => {
    const spilling =
      "We look at the teacher's role as establishing conditions in which the learner may sense the required future state and creatively constitute her own system of action control and a system of sensory corrections.";
    const end15 = items(
      "We look at the teacher's role as establishing conditions in which the learner may sense the required",
      "future state and creatively constitute her own system of action control and a system of sensory",
      "MIND, CULTURE, AND ACTIVITY",
      "15",
    );
    const start16 = items(
      "16",
      "A. SHVARTS AND A. BAKKER",
      "corrections. Moreover, in some cases, the learner may became aware of her own system of regulation",
    );

    const onFirst = findSentenceSegments(end15, [{ index: 0, text: spilling }], { after: start16 });
    expect(owned(onFirst)).toEqual([0, 1]);

    const onSecond = findSentenceSegments(
      start16,
      [{ index: 0, text: spilling, lookbehind: true }],
      { before: end15 },
    );
    expect(owned(onSecond)).toEqual([2]);
    const [{ from, to }] = onSecond.get(2)!;
    expect(start16[2].str.slice(from, to)).toBe("corrections");
  });

  test("its rest lights up overleaf, without the running head", () => {
    const segs = findSentenceSegments(
      page12,
      [{ index: 0, text: sentence, lookbehind: true }],
      { before: page11 },
    );
    expect(owned(segs)).toEqual([2, 3]);
  });
});

describe("text beyond ASCII", () => {
  test("ligatures in the PDF match the plain letters in the sentence", () => {
    const page = items("The classiﬁcation of ﬁnite groups was eventually completed.");
    const r = highlightRanges(page, "The classification of finite groups was eventually completed.");
    expect(r.get(0)).toEqual([0, page[0].str.length - 1]);
  });

  test("accents match whether or not the sentence kept them", () => {
    const page = items("Le café se trouve près de la gare centrale.");
    expect(highlightRanges(page, "Le cafe se trouve pres de la gare centrale.").size).toBe(1);
  });

  test("non-Latin scripts are matched", () => {
    const s = "Η γλώσσα είναι ένα σύστημα επικοινωνίας μεταξύ ανθρώπων.";
    expect(highlightRanges(items(s), s).get(0)).toEqual([0, s.length - 1]);
  });

  test("a character whose lowercase is longer does not shift later offsets", () => {
    // "İ".toLowerCase() is two characters; lowercasing the whole item at once
    // would push every offset after it one place right.
    const str = "İstanbul is a large city. Ankara is the capital of the country.";
    const segs = findSentenceSegments(items(str), [
      { index: 1, text: "Ankara is the capital of the country." },
    ]);
    const [{ from, to }] = segs.get(0)!;
    expect(str.slice(from, to)).toBe("Ankara is the capital of the country");
  });

  test("normalizePage spans a surrogate pair as one character", () => {
    const page = normalizePage(items("a𝐱b"));
    expect(page.norm).toBe("axb");
    expect(Array.from(page.offsetOf)).toEqual([0, 1, 3]);
    expect(Array.from(page.endOf)).toEqual([1, 3, 4]);
  });
});
