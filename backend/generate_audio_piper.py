import sys
import os
import json
import subprocess
import tempfile
import hashlib
import signal
import wave
from pathlib import Path
from typing import Optional

# Check if piper is available
try:
    from piper import PiperVoice, SynthesisConfig
    PIPER_AVAILABLE = True
except ImportError:
    PIPER_AVAILABLE = False

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

def get_available_piper_voices():
    """
    Get all available Piper voices from the piper_voices directory.
    
    Returns:
        List of available voice dictionaries with metadata
    """
    voices_dir = Path(__file__).parent / "piper_voices"
    voices = []
    
    if not voices_dir.exists():
        return voices
    
    # Look for .onnx files
    for onnx_file in voices_dir.glob("*.onnx"):
        json_file = onnx_file.with_suffix(".onnx.json")
        
        if json_file.exists():
            try:
                with open(json_file, 'r') as f:
                    voice_config = json.load(f)
                
                # Extract voice info from filename and config
                voice_name = onnx_file.stem
                language = voice_config.get("language", {}).get("code", "unknown")
                name_from_config = voice_config.get("dataset", voice_name)
                
                # Parse voice name for better display
                voice_parts = voice_name.split("-")
                if len(voice_parts) >= 2:
                    lang_code = voice_parts[0]
                    voice_id = voice_parts[1]
                    quality = voice_parts[2] if len(voice_parts) > 2 else "medium"
                    
                    display_name = f"{voice_id.title()} ({lang_code.upper()}) - {quality.title()}"
                else:
                    display_name = voice_name
                
                voices.append({
                    "id": voice_name,
                    "name": display_name,
                    "path": str(onnx_file),
                    "language": language,
                    "quality": voice_config.get("quality", "medium"),
                    "sample_rate": voice_config.get("audio", {}).get("sample_rate", 22050),
                    "speaker_count": voice_config.get("num_speakers", 1)
                })
            except Exception as e:
                print(f"Warning: Could not parse voice config for {onnx_file}: {e}", file=sys.stderr)
    
    # Sort by language, then by quality (high > medium > low)
    quality_order = {"high": 0, "medium": 1, "low": 2}
    voices.sort(key=lambda v: (v["language"], quality_order.get(v["quality"], 3), v["name"]))
    
    return voices

def text_to_audio_file_piper(
    text: str, 
    voice_id: str = "en_US-lessac-high",
    speed: float = 1.0, 
    output_dir: str = "audio_files", 
    sentence_index: Optional[int] = None
) -> str:
    """
    Generates an audio file from text using Piper TTS.
    
    Args:
        text (str): The text to convert to speech
        voice_id (str): The voice ID to use (should match a .onnx file name)
        speed (float): Speech speed multiplier (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
        output_dir (str): Directory to save audio files
        sentence_index (int): Optional sentence index to include in filename for caching
    
    Returns:
        str: Path to the generated audio file
    """
    global shutdown_requested
    
    if not PIPER_AVAILABLE:
        raise Exception("Piper TTS is not available. Please install piper-tts: pip install piper-tts")
    
    try:
        # Check for shutdown signal
        if shutdown_requested:
            raise Exception("Process interrupted")
            
        # Ensure output directory exists
        Path(output_dir).mkdir(exist_ok=True)
        
        # Create a unique filename based on text hash, speed, voice, and sentence index
        text_hash = hashlib.md5(f"{text}_{speed}_{voice_id}".encode()).hexdigest()[:8]
        
        # Include sentence index in filename if provided for better caching
        if sentence_index is not None:
            base_name = f"piper_speech_idx{sentence_index}_{text_hash}"
        else:
            base_name = f"piper_speech_{text_hash}"
        
        # Final MP3 file for browser compatibility
        final_filename = f"{base_name}.mp3"
        final_filepath = os.path.join(output_dir, final_filename)
        
        # Check if file already exists (server-side caching)
        if os.path.exists(final_filepath):
            return final_filepath
        
        # Find the voice file
        voices_dir = Path(__file__).parent / "piper_voices"
        voice_path = voices_dir / f"{voice_id}.onnx"
        
        if not voice_path.exists():
            # Try to find a similar voice
            available_voices = get_available_piper_voices()
            if available_voices:
                voice_path = Path(available_voices[0]["path"])
                print(f"Warning: Voice '{voice_id}' not found, using '{available_voices[0]['id']}' instead", file=sys.stderr)
            else:
                raise Exception(f"No Piper voices found in {voices_dir}")
        
        # Use a temporary file for Piper output
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            temp_filepath = temp_file.name
        
        try:
            # Check for shutdown signal before TTS
            if shutdown_requested:
                raise Exception("Process interrupted")
                
            # Load the Piper voice
            voice = PiperVoice.load(str(voice_path))
            
            # Configure synthesis with speed adjustment
            syn_config = SynthesisConfig(
                length_scale=1.0 / speed,  # Inverse relationship: higher speed = lower length_scale
                noise_scale=0.667,        # Slight audio variation
                noise_w_scale=0.8,        # Moderate speaking variation
                normalize_audio=True      # Normalize audio levels
            )
            
            # Generate audio
            with wave.open(temp_filepath, "wb") as wav_file:
                voice.synthesize_wav(text, wav_file, syn_config=syn_config)
            
            # Check for shutdown signal after TTS
            if shutdown_requested:
                raise Exception("Process interrupted")
            
            # Check if the temporary file was created
            if not os.path.exists(temp_filepath):
                raise Exception("Piper failed to create audio file")
            
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
            "error": "Usage: python generate_audio_piper.py <text> [voice_id] [speed] [output_dir] [sentence_index]"
        }
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    voice_id = sys.argv[2] if len(sys.argv) > 2 else "en_US-lessac-high"
    speed = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    output_dir = sys.argv[4] if len(sys.argv) > 4 else "audio_files"
    sentence_index = int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5].isdigit() else None
    
    try:
        audio_path = text_to_audio_file_piper(text, voice_id, speed, output_dir, sentence_index)
        # Return JSON response for easier parsing
        result = {
            "success": True,
            "audio_path": audio_path,
            "filename": os.path.basename(audio_path),
            "engine": "piper"
        }
        print(json.dumps(result))
    except Exception as e:
        result = {
            "success": False,
            "error": str(e),
            "engine": "piper"
        }
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)
