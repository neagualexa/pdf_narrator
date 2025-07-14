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
    GENERATE_AUDIO_PIPER: path.join(
      __dirname,
      "../src_python/generate_audio_piper.py"
    ),
    GET_VOICES: path.join(__dirname, "../src_python/get_voices_combined.py"),
  },
  CLEANUP: {
    MAX_AGE_MS: 60 * 60 * 1000, // 1 hour
    CLEANUP_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
    PROCESS_KILL_TIMEOUT_MS: 1000,
  },
  DEFAULTS: {
    TTS_ENGINE: "piper" as const,
    PIPER_VOICE: "en_US-lessac-high",
    PIPER_SPEED: 1.0,
    CACHE_DISTANCE: 2,
  },
} as const;
