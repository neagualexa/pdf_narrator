import {
  findHighlightRanges,
  findNormalizedRange,
  normalizePage,
} from "./pdfHighlight";

const items = (...strs: string[]) => strs.map((str) => ({ str }));

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
