import sys
import pyttsx3

def text_to_speech(text, speed=180):
    """
    Initializes the TTS engine, speaks the given text, and waits for it to finish.
    This function is designed to be called as a standalone script.
    
    Args:
        text (str): The text to speak
        speed (int): The speech rate in words per minute (default: 180)
    """
    try:
        # Initialize a new engine for each call to ensure stability
        engine = pyttsx3.init()
        
        # Set properties if desired (optional)
        engine.setProperty('rate', speed) 
        
        # Queue the text to be spoken
        engine.say(text)
        
        # Process the command and wait for speech to complete
        engine.runAndWait()
        
    except Exception as e:
        print(f"Error in pyttsx3 engine: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # The script expects text as the first argument and optionally speed as the second
    if len(sys.argv) > 1:
        # Join all arguments except the last one in case the sentence contains spaces
        # Check if the last argument is a number (speed parameter)
        try:
            speed = int(sys.argv[-1])
            # If it's a valid number, use it as speed and exclude from text
            text_to_speak = " ".join(sys.argv[1:-1])
            text_to_speech(text_to_speak, speed)
        except ValueError:
            # If last argument is not a number, include it in the text
            text_to_speak = " ".join(sys.argv[1:])
            text_to_speech(text_to_speak)
    else:
        # If no text is provided, print an error message.
        print("Usage: python speak.py <text to speak> [speed]", file=sys.stderr)
        sys.exit(1)
