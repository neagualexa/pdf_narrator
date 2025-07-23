import sys
import nltk
import json
import re
import signal
import os
from typing import List, Dict, Any

# Global flag for graceful shutdown
shutdown_requested = False

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
    
    # Handle spell-out words (add spaces between letters)
    spell_out_words = pronunciation_rules.get("spell_out", [])
    for word in spell_out_words:
        if shutdown_requested:
            break
        # Match the word with word boundaries
        pattern = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
        # Replace with spaced letters (e.g., "ITS" -> "I T S")
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

def filter_reference_sections(sentences: List[str]) -> List[str]:
    """
    Remove sentences that appear to be from reference/bibliography sections.
    Optimized with compiled patterns and early filtering.
    """
    global shutdown_requested
    if shutdown_requested:
        return sentences
    
    filtered_sentences = []
    
    # Compile patterns for better performance
    bibliography_pattern = re.compile(r'\b(?:19|20)\d{2}\b.*?\.\s*[A-Z][^.]*\.\s*[A-Z]')
    reference_keywords = re.compile(r'^\s*(References?|Bibliography|Works?\s+Cited|Sources?)\s*\.?\s*$', re.IGNORECASE)
    url_pattern = re.compile(r'\b(doi:|https?://|www\.)', re.IGNORECASE)
    year_pattern = re.compile(r'\b(?:19|20)\d{2}\b')
    
    for sentence in sentences:
        if shutdown_requested:
            break
            
        # Skip sentences that look like bibliography entries
        if bibliography_pattern.search(sentence):
            continue
            
        # Skip sentences starting with common reference keywords
        if reference_keywords.match(sentence):
            continue
            
        # Skip sentences that are likely DOI or URL references
        if url_pattern.search(sentence):
            continue
            
        # Skip sentences with multiple years (likely reference lists)
        year_matches = year_pattern.findall(sentence)
        if len(year_matches) > 2:
            continue
            
        # Skip very short sentences that might be citation fragments
        if len(sentence.strip()) < 20:
            continue
            
        filtered_sentences.append(sentence)
    
    return filtered_sentences

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
            print(json.dumps([]))
            return

        # First, fix hyphenated line breaks from PDF text
        text = fix_hyphenated_line_breaks(text)
        
        if shutdown_requested:
            print(json.dumps([]))
            return

        # Apply vocabulary pronunciation rules and replacements
        text = apply_vocabulary_rules(text, vocab_config)
        
        if shutdown_requested:
            print(json.dumps([]))
            return

        # Then, filter out Harvard and Vancouver citations from the entire text
        filtered_text = filter_harvard_citations_and_references(text)
        
        if shutdown_requested:
            print(json.dumps([]))
            return
        
        # Split into sentences
        sentences = nltk.sent_tokenize(filtered_text)
        
        if shutdown_requested:
            print(json.dumps([]))
            return
        
        # Filter out reference sections and bibliography entries
        clean_sentences = filter_reference_sections(sentences)
        
        # Additional filtering: remove empty sentences and normalize whitespace
        final_sentences = []
        for sentence in clean_sentences:
            if shutdown_requested:
                break
            cleaned = sentence.strip()
            if cleaned and len(cleaned) > 10:  # Minimum meaningful length
                final_sentences.append(cleaned)
        
        # Print the list of clean sentences as a JSON string
        print(json.dumps(final_sentences))
        
    except KeyboardInterrupt:
        print(json.dumps([]), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        # Output any errors to stderr
        error_msg = f"Error in sentence splitting script: {e}"
        print(error_msg, file=sys.stderr)
        print(json.dumps([]), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # The script expects the text to be passed as a single argument.
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
        split_text_into_sentences(input_text)
    else:
        # If no text is provided, output an empty JSON array.
        print(json.dumps([]))
