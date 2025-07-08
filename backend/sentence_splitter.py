import sys
import nltk
import json

def split_text_into_sentences(text):
    """
    Uses NLTK to split a block of text into sentences and prints them
    as a JSON array to standard output.
    """
    try:
        # Ensure the 'punkt' tokenizer is available
        try:
            nltk.data.find('tokenizers/punkt')
        except nltk.downloader.DownloadError:
            # This is a fallback, but it's better to run `nltk.download('punkt')` once manually
            nltk.download('punkt', quiet=True)

        sentences = nltk.sent_tokenize(text)
        
        # Print the list of sentences as a JSON string
        print(json.dumps(sentences))
        
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
