import sys
import json
import pyttsx3

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
        'microsoft mark', 'microsoft eva', 'microsoft helen'
    ]
    
    # Medium priority voices (decent quality)
    medium_priority_voices = [
        'fred', 'ralph', 'albert', 'bad news', 'bahh', 'bells',
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
    if voice_info['gender'] != 'unknown':
        return 3
    
    # Default priority for other voices
    return 4

def get_available_voices():
    """
    Get all available voices from pyttsx3 TTS engine.
    
    Returns:
        dict: JSON response with success status and voice data
    """
    try:
        # Initialize TTS engine
        engine = pyttsx3.init()
        
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
                'index': i
            }
            voice_list.append(voice_info)
        
        # Sort voices by priority (best voices first)
        voice_list.sort(key=get_voice_priority)
        
        # Update index after sorting to maintain correct order
        for i, voice_info in enumerate(voice_list):
            voice_info['sorted_index'] = i
        
        # Cleanup engine
        engine.stop()
        del engine
        
        return {
            "success": True,
            "voices": voice_list,
            "count": len(voice_list)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "voices": [],
            "count": 0
        }

if __name__ == "__main__":
    result = get_available_voices()
    print(json.dumps(result))
