import sys
import nltk
import json
import re
import signal
import os
from typing import List, Dict, Any

# Global flag for graceful shutdown
shutdown_requested = False

# Page sentinel injected by the upload route between pages. Deliberately built
# from characters no transformation in this file touches: it has no parentheses
# or brackets (citation filters), no hyphens (line-break joins), no whitespace
# (the \s+ collapse) and no symbol from vocabulary_config word_replacements.
PAGE_MARKER_RE = re.compile(r'<<<PDFPAGE:(\d+)>>>')

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global shutdown_requested
    shutdown_requested = True
    print(json.dumps([]), file=sys.stderr)
    sys.exit(1)

# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def load_vocabulary_config() -> Dict[str, Any]:
    """
    Load vocabulary configuration from JSON file.
    Returns default config if file doesn't exist or can't be loaded.
    """
    config_path = os.path.join(os.path.dirname(__file__), 'vocabulary_config.json')
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        # Return minimal default config if file is missing or invalid
        return {
            "pronunciation_rules": {
                "spell_out": ["ITS", "API", "URL", "HTML", "CSS"]
            },
            "word_replacements": {
                "e.g.": "for example",
                "i.e.": "that is",
                "etc.": "etcetera",
                "&": "and"
            }
        }

def apply_vocabulary_rules(text: str, config: Dict[str, Any]) -> str:
    """
    Apply vocabulary pronunciation rules and word replacements to text.
    """
    global shutdown_requested
    if shutdown_requested:
        return text
    
    # Apply word replacements first
    replacements = config.get("word_replacements", {})
    for original, replacement in replacements.items():
        if shutdown_requested:
            break
        
        # Handle different types of replacements
        if any(char in original for char in '.,;:!?'):
            # Punctuation-containing words (e.g., "e.g.", "i.e.")
            pattern = re.compile(re.escape(original), re.IGNORECASE)
        elif original in ['&', '@', '#', '%', '$', '€', '£', '¥']:
            # Symbols that should be standalone (surrounded by whitespace or word boundaries)
            pattern = re.compile(r'(?<!\S)' + re.escape(original) + r'(?!\S)', re.IGNORECASE)
        else:
            # Regular words - use word boundaries
            pattern = re.compile(r'\b' + re.escape(original) + r'\b', re.IGNORECASE)
        
        text = pattern.sub(replacement, text)
    
    # Apply pronunciation rules
    pronunciation_rules = config.get("pronunciation_rules", {})
    
    # Handle spell-out words (add spaces between letters).
    # Matching is case-sensitive: only exact-case occurrences are spelled out.
    spell_out_words = pronunciation_rules.get("spell_out", [])
    for word in spell_out_words:
        if shutdown_requested:
            break
        # Compile a case-sensitive pattern so only exact-case matches are changed.
        pattern = re.compile(r'\b' + re.escape(word) + r'\b')
        # Replace with spaced letters (e.g., "ITS" -> "I T S"). Always output uppercase letters.
        spaced_word = ' '.join(word.upper())
        text = pattern.sub(spaced_word, text)
    
    return text

def fix_hyphenated_line_breaks(text: str) -> str:
    """
    Fix hyphenated words that are broken across lines in PDF text.
    Converts patterns like "author- ing" back to "authoring".
    """
    global shutdown_requested
    if shutdown_requested:
        return text
    
    # Pattern to match hyphenated line breaks:
    # - word ending with hyphen and optional whitespace
    # - followed by newline or multiple spaces
    # - followed by word continuation (lowercase letter or common word parts)
    patterns = [
        # Basic pattern: "word-\ning" -> "wording"
        re.compile(r'(\w+)-\s*\n\s*([a-z]+)', re.MULTILINE),
        # Pattern with multiple spaces instead of newline: "word- ing" -> "wording"
        re.compile(r'(\w+)-\s{2,}([a-z]+)'),
        # Pattern for hyphen followed by whitespace and lowercase: "word- ing" -> "wording"
        re.compile(r'(\w+)-\s+([a-z]{2,})'),
    ]
    
    for pattern in patterns:
        if shutdown_requested:
            break
        # Replace hyphenated breaks with joined words
        text = pattern.sub(r'\1\2', text)
    
    return text

def filter_harvard_citations_and_references(text: str) -> str:
    """
    Remove Harvard citations, Vancouver citations, and reference sections from text.
    Optimized with compiled regex patterns for better performance.
    """
    global shutdown_requested
    if shutdown_requested:
        return text
    
    # Compile regex patterns for better performance
    patterns = [
        # Remove Harvard citations (Author, Year) - covers all parenthetical citations with years
        re.compile(r'\([^()]*\b(?:19|20)\d{2}[^()]*\)'),
        # Remove Vancouver citations [1] or [1,2,3]
        re.compile(r'\[\s*\d+(?:\s*[-,]\s*\d+)*\s*\]'),
        # Remove ibid references
        re.compile(r'\bibid\.?\b', re.IGNORECASE),
    ]
    
    # Apply all patterns
    for pattern in patterns:
        if shutdown_requested:
            break
        text = pattern.sub('', text)
    
    # Clean up punctuation and formatting issues after citation removal
    # Fix double commas and spaces
    text = re.sub(r'\s*,\s*,', ',', text)
    # Remove leading commas and spaces
    text = re.sub(r'^\s*,\s*', '', text)
    # Remove trailing commas before periods
    text = re.sub(r',\s*\.', '.', text)
    # Fix spacing around commas after removing citations
    text = re.sub(r'\s*,\s+', ', ', text)
    # Clean up extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

# Compiled once - these are hot across every sentence in the document.
_BIBLIOGRAPHY_PATTERN = re.compile(r'\b(?:19|20)\d{2}\b.*?\.\s*[A-Z][^.]*\.\s*[A-Z]')
_REFERENCE_KEYWORDS = re.compile(r'^\s*(References?|Bibliography|Works?\s+Cited|Sources?)\s*\.?\s*$', re.IGNORECASE)
_URL_PATTERN = re.compile(r'\b(doi:|https?://|www\.)', re.IGNORECASE)
_YEAR_PATTERN = re.compile(r'\b(?:19|20)\d{2}\b')


def is_reference_like(sentence: str) -> bool:
    """
    True when a sentence looks like a reference/bibliography entry rather than
    body text worth reading aloud.
    """
    # Bibliography entries
    if _BIBLIOGRAPHY_PATTERN.search(sentence):
        return True

    # Section headings such as "References"
    if _REFERENCE_KEYWORDS.match(sentence):
        return True

    # DOI or URL references
    if _URL_PATTERN.search(sentence):
        return True

    # Multiple years - likely a reference list
    if len(_YEAR_PATTERN.findall(sentence)) > 2:
        return True

    # Citation fragments
    if len(sentence.strip()) < 20:
        return True

    return False


def filter_reference_sections(sentences: List[str]) -> List[str]:
    """
    Remove sentences that appear to be from reference/bibliography sections.
    """
    global shutdown_requested
    if shutdown_requested:
        return sentences

    filtered_sentences = []
    for sentence in sentences:
        if shutdown_requested:
            break
        if is_reference_like(sentence):
            continue
        filtered_sentences.append(sentence)

    return filtered_sentences


def assign_pages(sentences: List[str]) -> List[Dict[str, Any]]:
    """
    Consume the page sentinels and tag every sentence with the 1-based page it
    starts on. Runs before reference filtering so that dropping a sentence can
    never lose a page transition.
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

def split_text_into_sentences(text: str) -> None:
    """
    Uses NLTK to split a block of text into sentences, fixes hyphenated line breaks,
    applies vocabulary pronunciation rules, filters out Harvard citations and Vancouver 
    citations, and prints them as a JSON array to standard output. 
    Optimized for better performance and error handling.
    """
    global shutdown_requested
    
    try:
        # Load vocabulary configuration
        vocab_config = load_vocabulary_config()
        
        # Ensure the 'punkt' tokenizer is available
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            # Download punkt if not available, but do it quietly
            nltk.download('punkt', quiet=True)

        if shutdown_requested:
            print(json.dumps({"sentences": [], "pages": []}))
            return

        # First, fix hyphenated line breaks from PDF text
        text = fix_hyphenated_line_breaks(text)
        
        if shutdown_requested:
            print(json.dumps({"sentences": [], "pages": []}))
            return

        # Apply vocabulary pronunciation rules and replacements
        text = apply_vocabulary_rules(text, vocab_config)
        
        if shutdown_requested:
            print(json.dumps({"sentences": [], "pages": []}))
            return

        # Then, filter out Harvard and Vancouver citations from the entire text
        filtered_text = filter_harvard_citations_and_references(text)
        
        if shutdown_requested:
            print(json.dumps({"sentences": [], "pages": []}))
            return
        
        # Split into sentences
        sentences = nltk.sent_tokenize(filtered_text)
        
        if shutdown_requested:
            print(json.dumps({"sentences": [], "pages": []}))
            return

        # Resolve page numbers before any filtering drops a sentence.
        tagged = assign_pages(sentences)

        final_sentences: List[str] = []
        final_pages: List[int] = []

        for entry in tagged:
            if shutdown_requested:
                break

            sentence = entry["text"]

            # Filter out reference sections and bibliography entries
            if is_reference_like(sentence):
                continue

            cleaned = sentence.strip()
            if cleaned and len(cleaned) > 10:  # Minimum meaningful length
                final_sentences.append(cleaned)
                final_pages.append(entry["page"])

        print(json.dumps({"sentences": final_sentences, "pages": final_pages}))
        
    except KeyboardInterrupt:
        print(json.dumps({"sentences": [], "pages": []}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        # Output any errors to stderr
        error_msg = f"Error in sentence splitting script: {e}"
        print(error_msg, file=sys.stderr)
        print(json.dumps({"sentences": [], "pages": []}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # The script expects the text to be passed as a single argument.
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
        split_text_into_sentences(input_text)
    else:
        # If no text is provided, output an empty result.
        print(json.dumps({"sentences": [], "pages": []}))
