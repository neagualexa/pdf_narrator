import sys
import pyttsx3

def text_to_speech(text):
    """
    Initializes the TTS engine, speaks the given text, and waits for it to finish.
    This function is designed to be called as a standalone script.
    """
    try:
        # Initialize a new engine for each call to ensure stability
        engine = pyttsx3.init()
        
        # Set properties if desired (optional)
        engine.setProperty('rate', 180) 
        
        # Queue the text to be spoken
        engine.say(text)
        
        # Process the command and wait for speech to complete
        engine.runAndWait()
        
    except Exception as e:
        print(f"Error in pyttsx3 engine: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # The script expects exactly one command-line argument: the text to speak.
    if len(sys.argv) > 1:
        # Join all arguments in case the sentence contains spaces
        text_to_speak = " ".join(sys.argv[1:])
        text_to_speech(text_to_speak)
    else:
        # If no text is provided, print an error message.
        print("Usage: python speak.py <text to speak>", file=sys.stderr)
        sys.exit(1)
