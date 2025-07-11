import sys
import os
import json
import subprocess
import tempfile
import hashlib
import signal
from pathlib import Path

# Global flag for graceful shutdown
shutdown_requested = False

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global shutdown_requested
    shutdown_requested = True
    print(json.dumps({"success": False, "error": "Process interrupted"}), file=sys.stderr)
    sys.exit(1)

# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def text_to_audio_file(text, speed=180, output_dir="audio_files", sentence_index=None, voice_id=None):
    """
    Generates an audio file from text using pyttsx3 and converts it to browser-compatible format using ffmpeg.
    
    Args:
        text (str): The text to convert to speech
        speed (int): The speech rate in words per minute (default: 180)
        output_dir (str): Directory to save audio files
        sentence_index (int): Optional sentence index to include in filename for caching
        voice_id (str): Optional voice ID to use for speech synthesis
    
    Returns:
        str: Path to the generated audio file
    """
    global shutdown_requested
    
    try:
        # Check for shutdown signal
        if shutdown_requested:
            raise Exception("Process interrupted")
            
        # Ensure output directory exists
        Path(output_dir).mkdir(exist_ok=True)
        
        # Create a unique filename based on text hash, speed, voice, and sentence index
        text_hash = hashlib.md5(f"{text}_{speed}_{voice_id or 'default'}".encode()).hexdigest()[:8]
        
        # Include sentence index in filename if provided for better caching
        if sentence_index is not None:
            base_name = f"speech_idx{sentence_index}_{text_hash}"
        else:
            base_name = f"speech_{text_hash}"
        
        # Final MP3 file for browser compatibility
        final_filename = f"{base_name}.mp3"
        final_filepath = os.path.join(output_dir, final_filename)
        
        # Check if file already exists (server-side caching)
        if os.path.exists(final_filepath):
            return final_filepath
        
        # Use a temporary file for pyttsx3 output
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            temp_filepath = temp_file.name
        
        try:
            # Check for shutdown signal before TTS
            if shutdown_requested:
                raise Exception("Process interrupted")
                
            # Use pyttsx3 to generate audio
            import pyttsx3
            
            # Initialize TTS engine
            engine = pyttsx3.init()
            
            # Set properties for better performance
            engine.setProperty('rate', speed)
            
            # Set voice if specified
            if voice_id:
                voices = engine.getProperty('voices')
                # Try to find the voice by ID first
                for voice in voices:
                    if voice.id == voice_id:
                        engine.setProperty('voice', voice.id)
                        break
                else:
                    # If voice ID not found, try to match by index (for backward compatibility)
                    try:
                        voice_index = int(voice_id)
                        if 0 <= voice_index < len(voices):
                            engine.setProperty('voice', voices[voice_index].id)
                    except (ValueError, IndexError):
                        # If voice not found, use default voice
                        print(f"Warning: Voice '{voice_id}' not found, using default voice", file=sys.stderr)
            
            # Save to temporary file
            engine.save_to_file(text, temp_filepath)
            engine.runAndWait()
            
            # Check for shutdown signal after TTS
            if shutdown_requested:
                raise Exception("Process interrupted")
            
            # Check if the temporary file was created
            if not os.path.exists(temp_filepath):
                raise Exception("pyttsx3 failed to create audio file")
            
            # Convert the file to MP3 using ffmpeg for browser compatibility
            try:
                # Use ffmpeg to convert to MP3 with optimized settings
                ffmpeg_cmd = [
                    'ffmpeg',
                    '-i', temp_filepath,          # Input file
                    '-y',                         # Overwrite output file if it exists
                    '-acodec', 'libmp3lame',     # Use LAME MP3 encoder
                    '-ar', '22050',              # Sample rate: 22.05 kHz (good for speech)
                    '-ab', '64k',                # Bit rate: 64kbps (sufficient for speech)
                    '-ac', '1',                  # Mono channel
                    '-f', 'mp3',                 # Force MP3 format
                    '-loglevel', 'error',        # Reduce ffmpeg verbosity
                    final_filepath               # Output file
                ]
                
                # Run ffmpeg with timeout protection
                result = subprocess.run(
                    ffmpeg_cmd, 
                    capture_output=True, 
                    text=True, 
                    timeout=30  # 30 second timeout
                )
                
                if result.returncode != 0:
                    raise Exception(f"ffmpeg conversion failed: {result.stderr}")
                
                # Verify the final file exists and has content
                if not os.path.exists(final_filepath) or os.path.getsize(final_filepath) == 0:
                    raise Exception("ffmpeg failed to create valid output file")
                
                return final_filepath
                
            except subprocess.TimeoutExpired:
                raise Exception("ffmpeg conversion timed out")
            except FileNotFoundError:
                raise Exception("ffmpeg not found. Please install ffmpeg.")
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_filepath):
                try:
                    os.unlink(temp_filepath)
                except OSError:
                    pass  # Ignore cleanup errors
        
    except Exception as e:
        # Clean up any partial files
        if 'final_filepath' in locals() and os.path.exists(final_filepath):
            try:
                os.unlink(final_filepath)
            except OSError:
                pass
        
        raise e

if __name__ == "__main__":
    if len(sys.argv) < 2:
        result = {
            "success": False,
            "error": "Usage: python generate_audio.py <text> [speed] [output_dir] [sentence_index] [voice_id]"
        }
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    speed = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 180
    output_dir = sys.argv[3] if len(sys.argv) > 3 else "audio_files"
    sentence_index = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else None
    voice_id = sys.argv[5] if len(sys.argv) > 5 else None
    
    try:
        audio_path = text_to_audio_file(text, speed, output_dir, sentence_index, voice_id)
        # Return JSON response for easier parsing
        result = {
            "success": True,
            "audio_path": audio_path,
            "filename": os.path.basename(audio_path)
        }
        print(json.dumps(result))
    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)
