import sys
import json
import os
from pathlib import Path

def get_voice_priority(voice_info):
    """
    Assign priority to voices based on quality and common preferences.
    Lower numbers = higher priority (will appear first).
    """
    voice_name = voice_info['name'].lower()
    voice_id = voice_info['id'].lower()
    
    # High-quality voices that are commonly preferred
    high_priority_voices = [
        'alex', 'samantha', 'daniel', 'karen', 'moira', 'tessa',
        'victoria', 'allison', 'ava', 'susan', 'tom', 'zoe',
        'microsoft david', 'microsoft zira', 'microsoft hazel',
        'microsoft mark', 'microsoft eva', 'microsoft helen', 
        'lessac', 'ryan', 'cori', 'aru'  # Piper voices
    ]
    
    # Medium priority voices (decent quality)
    medium_priority_voices = [
        'fred', 'ralph', 'bad news', 'bahh', 'bells',
        'boing', 'bruce', 'bubbles', 'deranged', 'good news',
        'hysterical', 'junior', 'kathy', 'pipe organ', 'princess',
        'trinoids', 'vicki', 'whisper'
    ]
    
    # Check for high priority voices
    for priority_voice in high_priority_voices:
        if priority_voice in voice_name or priority_voice in voice_id:
            return 1
    
    # Check for medium priority voices
    for priority_voice in medium_priority_voices:
        if priority_voice in voice_name or priority_voice in voice_id:
            return 2
    
    # Prefer voices with known genders over unknown
    if voice_info.get('gender') and voice_info['gender'] != 'unknown':
        return 3
    
    # Default priority for other voices
    return 4

def get_pyttsx3_voices():
    """Get available pyttsx3 voices."""
    try:
        import pyttsx3
        
        # Initialize TTS engine
        engine = pyttsx3.init(driverName='nsss') # Use 'nsss' for macOS, adjust as needed for other platforms
        
        # Get available voices
        voices = engine.getProperty('voices')
        
        voice_list = []
        for i, voice in enumerate(voices):
            voice_info = {
                'id': voice.id,
                'name': voice.name,
                'languages': getattr(voice, 'languages', []),
                'gender': getattr(voice, 'gender', 'unknown'),
                'age': getattr(voice, 'age', 'unknown'),
                'index': i,
                'engine': 'pyttsx3',
                'type': 'system'
            }
            # Only include high priority voices (priority 1)
            if get_voice_priority(voice_info) == 1:
                voice_list.append(voice_info)
        
        # Cleanup engine
        engine.stop()
        del engine
        
        return voice_list
        
    except Exception as e:
        print(f"Error getting pyttsx3 voices: {e}", file=sys.stderr)
        return []

def get_piper_voices():
    """Get available Piper voices."""
    try:
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
                    
                    # Parse voice name for better display
                    voice_parts = voice_name.split("-")
                    if len(voice_parts) >= 2:
                        lang_code = voice_parts[0]
                        voice_id = voice_parts[1]
                        quality = voice_parts[2] if len(voice_parts) > 2 else "medium"
                        
                        display_name = f"{voice_id.title()} ({lang_code.upper()}) - {quality.title()}"
                    else:
                        display_name = voice_name
                    
                    # Determine gender from voice name patterns
                    gender = "unknown"
                    if any(name in voice_name.lower() for name in ["aru", "cori", "lessac"]):
                        gender = "female"
                    elif "ryan" in voice_name.lower():
                        gender = "male"
                    
                    voice_info = {
                        "id": voice_name,
                        "name": display_name,
                        "languages": [language] if language != "unknown" else [],
                        "gender": gender,
                        "age": "adult",
                        "index": len(voices),
                        "engine": "piper",
                        "type": "neural",
                        "quality": voice_config.get("quality", "medium"),
                        "sample_rate": voice_config.get("audio", {}).get("sample_rate", 22050),
                        "speaker_count": voice_config.get("num_speakers", 1)
                    }
                    
                    voices.append(voice_info)
                    
                except Exception as e:
                    print(f"Warning: Could not parse voice config for {onnx_file}: {e}", file=sys.stderr)
        
        # Sort by language, then by quality (high > medium > low)
        quality_order = {"high": 0, "medium": 1, "low": 2}
        voices.sort(key=lambda v: (v["languages"][0] if v["languages"] else "zzz", quality_order.get(v.get("quality", "medium"), 3), v["name"]))
        
        return voices
        
    except Exception as e:
        print(f"Error getting Piper voices: {e}", file=sys.stderr)
        return []

def get_available_voices(engine_type=None):
    """
    Get all available voices from both pyttsx3 and Piper TTS engines.
    
    Args:
        engine_type (str): Optional filter for engine type ('pyttsx3' or 'piper')
    
    Returns:
        dict: JSON response with success status and voice data
    """
    try:
        all_voices = []
        
        # Get pyttsx3 voices
        if engine_type is None or engine_type == 'pyttsx3':
            pyttsx3_voices = get_pyttsx3_voices()
            all_voices.extend(pyttsx3_voices)
        
        # Get Piper voices
        if engine_type is None or engine_type == 'piper':
            piper_voices = get_piper_voices()
            all_voices.extend(piper_voices)
        
        # Sort all voices by priority and name
        all_voices.sort(key=lambda v: (get_voice_priority(v), v["name"]))
        
        # Update index after sorting to maintain correct order
        for i, voice_info in enumerate(all_voices):
            voice_info['sorted_index'] = i
        
        return {
            "success": True,
            "voices": all_voices,
            "count": len(all_voices),
            "engines": {
                "pyttsx3": len([v for v in all_voices if v["engine"] == "pyttsx3"]),
                "piper": len([v for v in all_voices if v["engine"] == "piper"])
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "voices": [],
            "count": 0,
            "engines": {
                "pyttsx3": 0,
                "piper": 0
            }
        }

if __name__ == "__main__":
    engine_type = sys.argv[1] if len(sys.argv) > 1 else None
    result = get_available_voices(engine_type)
    print(json.dumps(result))
