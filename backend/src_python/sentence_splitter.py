"""
Splits a PDF's extracted text into the sentences the narrator reads.

Reads the page texts, joined by page sentinels, on stdin and prints
{"sentences": [...], "pages": [...]}: each sentence, and the 1-based page it
starts on.
"""

import json
import os
import re
import sys
from typing import Any, Dict, List

import nltk

# Page sentinel injected by the upload route between pages. Deliberately built
# from characters no transformation in this file touches: it has no parentheses
# or brackets (citation filters), no hyphens (line-break joins), no whitespace
# (the \s+ collapse) and no symbol from vocabulary_config word_replacements.
PAGE_MARKER_RE = re.compile(r'<<<PDFPAGE:(\d+)>>>')

# Abbreviations common in academic writing that NLTK's English model does not
# know, so it ends a sentence at them: "Wood et al. (1976) and in Bruner"
# loses its citation and is cut after "al.". Written as punkt stores them -
# lowercase, without the final period. Ones that often do end a sentence
# ("etc.", "no.") are left out, since punkt would then never split there.
ACADEMIC_ABBREVIATIONS = {
    "al", "cf", "e.g", "i.e", "viz", "approx", "resp",
    "fig", "figs", "eq", "eqs", "pp", "vol", "vols", "eds",
}


def get_sentence_tokenizer():
    """
    NLTK's English sentence tokenizer, taught the abbreviations above, with its
    model downloaded on first use.
    """
    try:
        from nltk.tokenize.punkt import PunktTokenizer  # NLTK >= 3.9
        resource, load = "punkt_tab", lambda: PunktTokenizer("english")
    except ImportError:
        resource, load = "punkt", lambda: nltk.data.load("tokenizers/punkt/english.pickle")
    try:
        tokenizer = load()
    except LookupError:
        nltk.download(resource, quiet=True)
        tokenizer = load()
    # No public API extends a trained model's abbreviations.
    tokenizer._params.abbrev_types.update(ACADEMIC_ABBREVIATIONS)
    return tokenizer

# A word broken across lines: "author-" then whitespace (the line break)
# then its lowercase continuation "ing".
_LINE_BREAK_HYPHEN = re.compile(r'(\w+)-\s+([a-z]+)')


def fix_hyphenated_line_breaks(text: str) -> str:
    """Rejoins words hyphenated across a line break: "author- ing" -> "authoring"."""
    return _LINE_BREAK_HYPHEN.sub(r'\1\2', text)


_CITATION_PATTERNS = [
    # Harvard: any parenthetical with a year in it, "(Wood et al., 1976)"
    re.compile(r'\([^()]*\b(?:19|20)\d{2}[^()]*\)'),
    # Vancouver: [1], [1, 2], [3-5]
    re.compile(r'\[\s*\d+(?:\s*[-,]\s*\d+)*\s*\]'),
    re.compile(r'\bibid\.?\b', re.IGNORECASE),
]


def filter_citations(text: str) -> str:
    """
    Removes citations, which are for the reader's eye, not the listener's ear,
    and tidies the punctuation they leave behind.
    """
    # A citation can span a page break, and deleting the page sentinel inside
    # it would tag every sentence up to the next page with the wrong page.
    def keep_page_markers(match: re.Match) -> str:
        return ' '.join(marker.group() for marker in PAGE_MARKER_RE.finditer(match.group()))

    for pattern in _CITATION_PATTERNS:
        text = pattern.sub(keep_page_markers, text)

    text = re.sub(r'\s+', ' ', text)
    # A deleted citation leaves its surroundings behind: "first (Wood, 2017)."
    # becomes "first ." and "(e.g., A, 2010), and" becomes ", , and". The
    # space stays after a full stop, though: in "Wood et al. ." it is the only
    # sign of the sentence's end, the first one being an abbreviation's. And a
    # digit after the mark is a decimal, as in "p < .05".
    text = re.sub(r'(?<![.!?])\s+([.,;:!?])(?!\d)', r'\1', text)
    text = re.sub(r'([,;:])(?:\s*[,;:])+', r'\1', text)
    text = re.sub(r',(?=[.!?])', '', text)
    return text.strip()


_LINK = re.compile(r'\b(?:doi:|https?://|www\.)', re.IGNORECASE)


def is_prose(sentence: str) -> bool:
    """
    Whether a sentence is text to read aloud, rather than what the extractor
    lets through around it: a publisher's front matter, which carries a link
    (the ISSN, DOI, licence and ORCID lines), or a chart's axis labels and
    other runs of numbers, which are not mostly words. Reference lists and
    notes are already gone, dropped by their headings during extraction.
    """
    if _LINK.search(sentence):
        return False
    tokens = sentence.split()
    words = sum(1 for token in tokens if any(char.isalpha() for char in token))
    return words > 0 and 2 * words >= len(tokens)


def assign_pages(sentences: List[str]) -> List[Dict[str, Any]]:
    """
    Consume the page sentinels and tag every sentence with the 1-based page it
    starts on. Runs before filtering, so that dropping a sentence can never
    lose a page transition.
    """
    tagged: List[Dict[str, Any]] = []
    current_page = 1

    for sentence in sentences:
        matches = list(PAGE_MARKER_RE.finditer(sentence))

        if matches:
            # Text before the first marker still belongs to the previous page;
            # with no such text the sentence starts on the new page.
            prefix = sentence[:matches[0].start()].strip()
            page = current_page if prefix else int(matches[0].group(1))
            current_page = int(matches[-1].group(1))
            cleaned = re.sub(r'\s+', ' ', PAGE_MARKER_RE.sub(' ', sentence)).strip()
        else:
            page = current_page
            cleaned = sentence

        tagged.append({"text": cleaned, "page": page})

    return tagged

def split_text_into_sentences(text: str) -> Dict[str, List[Any]]:
    """The sentences worth reading aloud, each with the page it starts on."""
    text = filter_citations(fix_hyphenated_line_breaks(text))

    # Pages are resolved before any filtering, so dropping a sentence can
    # never lose a page transition.
    tagged = assign_pages(get_sentence_tokenizer().tokenize(text))
    kept = [entry for entry in tagged if is_prose(entry["text"])]
    return {
        "sentences": [entry["text"] for entry in kept],
        "pages": [entry["page"] for entry in kept],
    }


if __name__ == "__main__":
    print(json.dumps(split_text_into_sentences(sys.stdin.read())))
