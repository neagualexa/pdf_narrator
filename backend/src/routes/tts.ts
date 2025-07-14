import { Router, Request, Response } from "express";
import { CONFIG } from "../config";
import { runPythonScript } from "../pythonRunner";
import { ttsEngineManager } from "../ttsEngineManager";
import { VoiceResponse } from "../types";

const router = Router();

// Route to get available TTS voices
router.get("/voices", (req: Request, res: Response): void => {
  runPythonScript(CONFIG.SCRIPTS.GET_VOICES, [])
    .then(({ stdout, stderr, code }) => {
      if (code === 0 && stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success) {
            const response: VoiceResponse = {
              success: true,
              voices: result.voices,
              count: result.count,
              engines: result.engines,
              currentEngine: ttsEngineManager.getCurrentEngine(),
            };
            res.json(response);
          } else {
            console.error("Python script error:", result.error);
            res.status(500).json({ error: result.error });
          }
        } catch (parseError) {
          console.error("Failed to parse voices JSON:", parseError);
          res.status(500).json({ error: "Failed to parse voice data" });
        }
      } else {
        console.error("Python script failed:", stderr);
        res.status(500).json({ error: "Failed to get available voices" });
      }
    })
    .catch((error) => {
      console.error("Error running get voices script:", error);
      res
        .status(500)
        .json({ error: "Failed to execute voice detection script" });
    });
});

// Route to get/set current TTS engine
router.get("/tts-engine", (req: Request, res: Response): void => {
  res.json({
    success: true,
    currentEngine: ttsEngineManager.getCurrentEngine(),
    availableEngines: ttsEngineManager.getAvailableEngines(),
  });
});

router.post("/tts-engine", (req: Request, res: Response): void => {
  const { engine } = req.body;

  if (!engine || !ttsEngineManager.isValidEngine(engine)) {
    res.status(400).json({
      error: "Invalid engine. Must be 'pyttsx3' or 'piper'",
    });
    return;
  }

  try {
    ttsEngineManager.setEngine(engine);
    res.json({
      success: true,
      currentEngine: ttsEngineManager.getCurrentEngine(),
      message: `TTS engine switched to ${engine}`,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Route to set the TTS engine (alias for compatibility)
router.post("/set-tts-engine", (req: Request, res: Response): void => {
  const { engine } = req.body;

  if (!ttsEngineManager.isValidEngine(engine)) {
    res.status(400).json({ error: "Invalid TTS engine specified." });
    return;
  }

  try {
    ttsEngineManager.setEngine(engine);
    res.json({ success: true, message: `TTS engine set to ${engine}.` });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Route to get the current TTS engine
router.get("/current-tts-engine", (req: Request, res: Response): void => {
  res.json({
    success: true,
    engine: ttsEngineManager.getCurrentEngine(),
  });
});

export default router;
