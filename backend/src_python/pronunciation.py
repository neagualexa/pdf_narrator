"""
How the narrator says what is written: abbreviations and symbols read as words
("e.g." as "for example", "&" as "and") and acronyms spelled out ("API" as
"A P I"), from vocabulary_config.json.

Applied only to the text handed to a speech engine, never to the sentences
themselves, which stay as written - they are what the reader sees and what is
matched against the page.
"""

import json
import os
import re
from typing import Any, Dict


def load_vocabulary_config() -> Dict[str, Any]:
    """The pronunciation rules. A missing or broken file is an error, not a silent default."""
    config_path = os.path.join(os.path.dirname(__file__), 'vocabulary_config.json')
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def apply_vocabulary_rules(text: str, config: Dict[str, Any]) -> str:
    """
    Apply vocabulary pronunciation rules and word replacements to text.
    """
    # Apply word replacements first
    replacements = config.get("word_replacements", {})
    for original, replacement in replacements.items():
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
        # Compile a case-sensitive pattern so only exact-case matches are changed.
        pattern = re.compile(r'\b' + re.escape(word) + r'\b')
        # Replace with spaced letters (e.g., "ITS" -> "I T S"). Always output uppercase letters.
        spaced_word = ' '.join(word.upper())
        text = pattern.sub(spaced_word, text)
    
    return text


def pronounce(text: str) -> str:
    """`text` as the speech engine should be given it."""
    return apply_vocabulary_rules(text, load_vocabulary_config())
