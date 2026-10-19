import path from "path";

export const CONFIG = {
  PORT: 3001,
  UPLOAD_DIR: "uploads/",
  AUDIO_DIR: path.join(__dirname, "../audio_files"),
  PYTHON_PATH: path.join(__dirname, "../../.venv/bin/python3"),
  SCRIPTS: {
    SENTENCE_SPLITTER: path.join(
      __dirname,
      "../src_python/sentence_splitter.py"
    ),
    GENERATE_AUDIO: path.join(__dirname, "../src_python/generate_audio.py"),
    GET_VOICES: path.join(__dirname, "../src_python/get_voices_combined.py"),
  },
  CLEANUP: {
    MAX_AGE_MS: 60 * 60 * 1000, // 1 hour
    CLEANUP_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  },
  DEFAULTS: {
    TTS_ENGINE: "piper" as const,
    PIPER_VOICE: "en_US-lessac-high",
    /** Speaking rate, in words per minute, when a request gives none. */
    WPM: 200,
  },
} as const;
