import sys
import nltk
import json
import re

def filter_harvard_citations_and_references(text):
    """
    Remove Harvard citations and reference sections from text.
    """
    # Remove in-text Harvard citations (Author, Year) or (Author Year)
    # Patterns like: (Smith, 2020), (Johnson & Brown, 2019), (Smith et al., 2021)
    text = re.sub(r'\([^()]*\b(?:19|20)\d{2}[^()]*\)', '', text)
    
    # Remove citations with page numbers like (Smith, 2020, p. 45) or (Smith, 2020: 45)
    text = re.sub(r'\([^()]*\b(?:19|20)\d{2}[^()]*[p\.:]?\s*\d+[^()]*\)', '', text)
    
    # Remove standalone citations at the end of sentences
    text = re.sub(r'\s*\([^()]*\b(?:19|20)\d{2}[^()]*\)\s*\.', '.', text)
    
    # Remove "et al." references
    text = re.sub(r'\bet\s+al\.?\b', '', text)
    
    # Remove ibid references
    text = re.sub(r'\bibid\.?\b', '', text, flags=re.IGNORECASE)
    
    # Remove "According to [Author]" patterns often followed by citations
    text = re.sub(r'According to [^,.()]*\([^()]*\b(?:19|20)\d{2}[^()]*\)', '', text, flags=re.IGNORECASE)
    
    # Clean up extra whitespace
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    
    return text

def filter_reference_sections(sentences):
    """
    Remove sentences that appear to be from reference/bibliography sections.
    """
    filtered_sentences = []
    
    for sentence in sentences:
        # Skip sentences that look like bibliography entries
        # Common patterns: Author, A. (Year). Title. Journal.
        if re.search(r'\b(?:19|20)\d{2}\b.*?\.\s*[A-Z][^.]*\.\s*[A-Z]', sentence):
            continue
            
        # Skip sentences starting with common reference keywords
        if re.match(r'^\s*(References?|Bibliography|Works?\s+Cited|Sources?)\s*\.?\s*$', sentence, re.IGNORECASE):
            continue
            
        # Skip sentences that are likely DOI or URL references
        if re.search(r'\b(doi:|https?://|www\.)', sentence, re.IGNORECASE):
            continue
            
        # Skip sentences with multiple years (likely reference lists)
        year_matches = re.findall(r'\b(?:19|20)\d{2}\b', sentence)
        if len(year_matches) > 2:
            continue
            
        # Skip very short sentences that might be citation fragments
        if len(sentence.strip()) < 20:
            continue
            
        filtered_sentences.append(sentence)
    
    return filtered_sentences

def split_text_into_sentences(text):
    """
    Uses NLTK to split a block of text into sentences, filters out Harvard citations
    and references, and prints them as a JSON array to standard output.
    """
    try:
        # Ensure the 'punkt' tokenizer is available
        try:
            nltk.data.find('tokenizers/punkt')
        except nltk.downloader.DownloadError:
            # This is a fallback, but it's better to run `nltk.download('punkt')` once manually
            nltk.download('punkt', quiet=True)

        # First, filter out Harvard citations from the entire text
        filtered_text = filter_harvard_citations_and_references(text)
        
        # Split into sentences
        sentences = nltk.sent_tokenize(filtered_text)
        
        # Filter out reference sections and bibliography entries
        clean_sentences = filter_reference_sections(sentences)
        
        # Print the list of clean sentences as a JSON string
        print(json.dumps(clean_sentences))
        
    except Exception as e:
        # Output any errors to stderr
        print(f"Error in sentence splitting script: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # The script expects the text to be passed as a single argument.
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
        split_text_into_sentences(input_text)
    else:
        # If no text is provided, output an empty JSON array.
        print(json.dumps([]))
