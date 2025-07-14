import sys
import nltk
import json
import re
import signal
from typing import List

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

def filter_harvard_citations_and_references(text: str) -> str:
    """
    Remove Harvard citations and reference sections from text.
    Optimized with compiled regex patterns for better performance.
    """
    global shutdown_requested
    if shutdown_requested:
        return text
    
    # Compile regex patterns for better performance
    patterns = [
        # Remove in-text Harvard citations (Author, Year) or (Author Year)
        re.compile(r'\([^()]*\b(?:19|20)\d{2}[^()]*\)'),
        # Remove citations with page numbers
        re.compile(r'\([^()]*\b(?:19|20)\d{2}[^()]*[p\.:]?\s*\d+[^()]*\)'),
        # Remove standalone citations at the end of sentences
        re.compile(r'\s*\([^()]*\b(?:19|20)\d{2}[^()]*\)\s*\.'),
        # Remove "et al." references
        re.compile(r'\bet\s+al\.?\b'),
        # Remove ibid references
        re.compile(r'\bibid\.?\b', re.IGNORECASE),
        # Remove "According to [Author]" patterns
        re.compile(r'According to [^,.()]*\([^()]*\b(?:19|20)\d{2}[^()]*\)', re.IGNORECASE),
    ]
    
    # Apply all patterns
    for pattern in patterns:
        if shutdown_requested:
            break
        text = pattern.sub('', text)
    
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
    Uses NLTK to split a block of text into sentences, filters out Harvard citations
    and references, and prints them as a JSON array to standard output.
    Optimized for better performance and error handling.
    """
    global shutdown_requested
    
    try:
        # Ensure the 'punkt' tokenizer is available
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            # Download punkt if not available, but do it quietly
            nltk.download('punkt', quiet=True)

        if shutdown_requested:
            print(json.dumps([]))
            return

        # First, filter out Harvard citations from the entire text
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
