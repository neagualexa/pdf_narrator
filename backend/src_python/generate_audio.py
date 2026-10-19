"""
Speaks sentences into MP3 files, as a long-lived worker.

Reads one job per line on stdin - {"engine", "text", "voice", "wpm",
"output"} as JSON - and answers each, in order, with one line:
{"success": true} or {"success": false, "error": ...}. Staying up is the
point: a Piper voice takes about half a second to load, a third of the time it
takes to speak a sentence, so each is loaded once and kept.

The caller names the output file, so it can tell whether the audio already
exists without asking; this only writes it.
"""

import functools
import json
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from pronunciation import pronounce

VOICES_DIR = Path(__file__).parent / "piper_voices"
# The rate Piper speaks at its natural pace: a requested rate is read as a
# multiple of it, within what Piper still renders cleanly.
PIPER_NATURAL_WPM = 180
PIPER_SPEED_RANGE = (0.5, 2.0)


@functools.lru_cache(maxsize=None)
def load_piper_voice(voice_id: str):
    from piper import PiperVoice

    model = VOICES_DIR / f"{voice_id}.onnx"
    if not model.exists():
        raise FileNotFoundError(f"Piper voice '{voice_id}' not found in {VOICES_DIR}")
    return PiperVoice.load(str(model))


def synthesize_piper(text: str, voice_id: str, wpm: float, wav_path: str) -> None:
    from piper import SynthesisConfig

    low, high = PIPER_SPEED_RANGE
    speed = min(high, max(low, wpm / PIPER_NATURAL_WPM))
    config = SynthesisConfig(
        length_scale=1.0 / speed,  # Piper stretches time: shorter is faster
        noise_scale=0.667,
        noise_w_scale=0.8,
        normalize_audio=True,
    )
    with wave.open(wav_path, "wb") as wav_file:
        load_piper_voice(voice_id).synthesize_wav(text, wav_file, syn_config=config)


def synthesize_pyttsx3(text: str, voice_id: str, wpm: float, wav_path: str) -> None:
    import pyttsx3

    engine = pyttsx3.init(driverName="nsss")  # macOS's speech synthesiser
    engine.setProperty("rate", wpm)
    if voice_id:
        if not any(voice.id == voice_id for voice in engine.getProperty("voices")):
            raise ValueError(f"pyttsx3 voice '{voice_id}' not found")
        engine.setProperty("voice", voice_id)
    engine.save_to_file(text, wav_path)
    engine.runAndWait()


ENGINES = {"piper": synthesize_piper, "pyttsx3": synthesize_pyttsx3}


def to_mp3(wav_path: str, mp3_path: str) -> None:
    """Mono 64 kbit/s MP3 at 22.05 kHz: plenty for speech, and plays everywhere."""
    subprocess.run(
        ["ffmpeg", "-i", wav_path, "-y", "-acodec", "libmp3lame", "-ar", "22050",
         "-ab", "64k", "-ac", "1", "-f", "mp3", "-loglevel", "error", mp3_path],
        check=True, capture_output=True, timeout=30,
    )


def generate(job: dict) -> None:
    synthesize = ENGINES[job["engine"]]
    output = job["output"]
    # Written aside and moved into place, so a half-written file - from a
    # failure, or a stop request killing this process - is never served as
    # the sentence's audio.
    partial = f"{output}.{os.getpid()}.part"
    with tempfile.TemporaryDirectory() as scratch:
        wav_path = os.path.join(scratch, "speech.wav")
        synthesize(pronounce(job["text"]), job.get("voice") or "", float(job["wpm"]), wav_path)
        try:
            to_mp3(wav_path, partial)
            os.replace(partial, output)
        finally:
            if os.path.exists(partial):
                os.unlink(partial)


if __name__ == "__main__":
    # stdout carries the answers, one line per job, so anything an engine
    # prints goes to stderr instead of corrupting them.
    answers = sys.stdout
    sys.stdout = sys.stderr
    for line in sys.stdin:
        try:
            generate(json.loads(line))
            result = {"success": True}
        except Exception as error:  # Reported to the caller, which shows it.
            result = {"success": False, "error": str(error)}
        print(json.dumps(result), file=answers, flush=True)
