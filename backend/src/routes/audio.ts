import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { CONFIG } from "../config";
import { speechWorker } from "../speechWorker";
import { ttsEngineManager } from "../ttsEngineManager";
import {
  SpeechJob,
  audioFilename,
  audioUrl,
  clearAllAudioCache,
} from "../audioUtils";
import { AudioGenerationRequest } from "../types";

const router = Router();

// Speaks a sentence, or returns the audio already made for it.
router.post(
  "/generate-audio",
  async (req: Request, res: Response): Promise<void> => {
    const { sentence, speed, voiceId }: AudioGenerationRequest = req.body;
    if (!sentence) {
      res.status(400).json({ error: "No sentence provided." });
      return;
    }

    const engine = ttsEngineManager.getCurrentEngine();
    const job: SpeechJob = {
      engine,
      text: sentence,
      voice: voiceId || (engine === "piper" ? CONFIG.DEFAULTS.PIPER_VOICE : ""),
      wpm: typeof speed === "number" ? speed : CONFIG.DEFAULTS.WPM,
    };
    const filename = audioFilename(job);
    const output = path.join(CONFIG.AUDIO_DIR, filename);

    if (fs.existsSync(output)) {
      res.json({ audioUrl: audioUrl(filename), filename, cached: true });
      return;
    }

    fs.mkdirSync(CONFIG.AUDIO_DIR, { recursive: true });
    const result = await speechWorker.speak({ ...job, output });

    if (result.status === "done") {
      res.json({ audioUrl: audioUrl(filename), filename, cached: false });
    } else if (result.status === "stopped") {
      // Dropped by a stop request before it started. An error status, so the
      // client never mistakes it for audio.
      res.status(409).json({ error: "Audio generation stopped." });
    } else {
      console.error("Audio generation failed:", result.error);
      res.status(500).json({ error: result.error });
    }
  }
);

// Stops speech generation: drops the queued sentences, and lets the one being
// spoken finish (see speechWorker).
router.post("/stop", (req: Request, res: Response): void => {
  const dropped = speechWorker.cancelQueued();
  res.status(200).json({ message: `Dropped ${dropped} queued sentence(s).` });
});

// Route to clear all audio cache files
router.post("/clear-audio-cache", (req: Request, res: Response): void => {
  try {
    const result = clearAllAudioCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
