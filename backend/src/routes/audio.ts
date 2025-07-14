import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { CONFIG } from "../config";
import { processManager } from "../processManager";
import { ttsEngineManager } from "../ttsEngineManager";
import {
  generateExpectedFilename,
  cleanupDistantAudioFiles,
  clearAllAudioCache,
  audioFileExists,
  deleteAudioFile,
} from "../audioUtils";
import { AudioGenerationRequest } from "../types";

const router = Router();

// Route to generate audio with sentence index for smart caching
router.post("/generate-audio-indexed", (req: Request, res: Response): void => {
  const { sentence, speed, sentenceIndex, voiceId }: AudioGenerationRequest =
    req.body;

  if (!sentence) {
    res.status(400).json({ error: "No sentence provided." });
    return;
  }

  const currentEngine = ttsEngineManager.getCurrentEngine();

  // Check if audio file already exists for this sentence index and speed
  const expectedFilename = generateExpectedFilename(
    sentence,
    speed || 180,
    sentenceIndex,
    voiceId,
    currentEngine
  );
  const audioPath = path.join(CONFIG.AUDIO_DIR, expectedFilename);

  // If file already exists, return it immediately
  if (fs.existsSync(audioPath)) {
    const audioUrl = `http://localhost:${CONFIG.PORT}/audio/${expectedFilename}`;
    res.json({
      audioUrl,
      filename: expectedFilename,
      cached: true,
    });
    return;
  }

  // File doesn't exist, generate it
  const processId = crypto.randomUUID();

  try {
    // Choose the appropriate script based on current TTS engine
    const scriptPath =
      currentEngine === "piper"
        ? CONFIG.SCRIPTS.GENERATE_AUDIO_PIPER
        : CONFIG.SCRIPTS.GENERATE_AUDIO;

    const args = [sentence];

    if (currentEngine === "piper") {
      // Piper arguments: text, voice_id, speed, output_dir, sentence_index
      if (voiceId) {
        args.push(voiceId);
      } else {
        args.push(CONFIG.DEFAULTS.PIPER_VOICE);
      }
      if (speed && typeof speed === "number") {
        // Convert pyttsx3 speed (words per minute) to Piper speed multiplier
        const piperSpeed = Math.min(2.0, Math.max(0.5, speed / 180));
        args.push(piperSpeed.toString());
      } else {
        args.push(CONFIG.DEFAULTS.PIPER_SPEED.toString());
      }
      args.push("audio_files"); // output directory
      if (sentenceIndex !== undefined) {
        args.push(sentenceIndex.toString()); // sentence index
      }
    } else {
      // pyttsx3 arguments: text, speed, output_dir, sentence_index, voice_id
      if (speed && typeof speed === "number") {
        args.push(speed.toString());
      }
      args.push("audio_files"); // output directory
      if (sentenceIndex !== undefined) {
        args.push(sentenceIndex.toString()); // sentence index
      }
      if (voiceId) {
        args.push(voiceId); // voice ID
      }
    }

    // Use the virtual environment Python and track the process
    const ttsProcess = spawn(CONFIG.PYTHON_PATH, [scriptPath, ...args]);

    // Track the process
    processManager.addProcess(processId, ttsProcess);

    let stdout = "";
    let stderr = "";

    if (ttsProcess.stdout) {
      ttsProcess.stdout.on("data", (data: any) => {
        stdout += data.toString();
      });
    }

    if (ttsProcess.stderr) {
      ttsProcess.stderr.on("data", (data: any) => {
        stderr += data.toString();
      });
    }

    ttsProcess.on("close", (code: any) => {
      // Remove from active processes
      processManager.removeProcess(processId);

      if (code === 0) {
        try {
          const audioInfo = JSON.parse(stdout.trim());

          if (audioInfo.success) {
            // Return the audio file URL
            const audioUrl = `http://localhost:${CONFIG.PORT}/audio/${audioInfo.filename}`;
            res.json({
              audioUrl,
              filename: audioInfo.filename,
              cached: false,
            });
          } else {
            res.status(500).json({ error: audioInfo.error });
          }
        } catch (parseError) {
          console.error("Error parsing Python script output:", parseError);
          res
            .status(500)
            .json({ error: "Failed to parse audio generation result." });
        }
      } else {
        console.error("Python script error:", stderr);
        res.status(500).json({ error: "Audio generation failed." });
      }
    });

    ttsProcess.on("error", (error: any) => {
      // Remove from active processes
      processManager.removeProcess(processId);
      console.error("Error spawning Python script:", error);
      res
        .status(500)
        .json({ error: "Failed to start audio generation process." });
    });
  } catch (error) {
    processManager.removeProcess(processId);
    console.error("Error generating audio:", error);
    res.status(500).json({ error: "Failed to generate audio file." });
  }
});

// Route to generate audio file from text (legacy endpoint)
router.post(
  "/generate-audio",
  async (req: Request, res: Response): Promise<void> => {
    const { sentence, speed } = req.body;

    if (!sentence) {
      res.status(400).json({ error: "No sentence provided." });
      return;
    }

    // Stop any existing TTS processes
    processManager.cleanupAllProcesses();

    const processId = crypto.randomUUID();

    try {
      // Call the Python script to generate audio file
      const scriptPath = CONFIG.SCRIPTS.GENERATE_AUDIO;
      const args = [sentence];
      if (speed && typeof speed === "number") {
        args.push(speed.toString());
      }
      args.push("audio_files"); // output directory

      // Use the virtual environment Python and track the process
      const ttsProcess = spawn(CONFIG.PYTHON_PATH, [scriptPath, ...args]);

      processManager.addProcess(processId, ttsProcess);

      let stdout = "";
      let stderr = "";

      if (ttsProcess.stdout) {
        ttsProcess.stdout.on("data", (data: any) => {
          stdout += data.toString();
        });
      }

      if (ttsProcess.stderr) {
        ttsProcess.stderr.on("data", (data: any) => {
          stderr += data.toString();
        });
      }

      ttsProcess.on("close", (code: any) => {
        processManager.removeProcess(processId);

        if (code === 0) {
          try {
            const audioInfo = JSON.parse(stdout.trim());

            if (audioInfo.success) {
              // Return the audio file URL
              const audioUrl = `http://localhost:${CONFIG.PORT}/audio/${audioInfo.filename}`;

              res.json({
                success: true,
                audioUrl: audioUrl,
                filename: audioInfo.filename,
              });
            } else {
              res.status(500).json({ error: audioInfo.error });
            }
          } catch (parseError) {
            console.error("Error parsing Python script output:", parseError);
            res
              .status(500)
              .json({ error: "Failed to parse audio generation result." });
          }
        } else {
          console.error(`Audio generation error (code ${code}):`, stderr);
          if (code === null) {
            // Process was killed (likely by stop request)
            res
              .status(200)
              .json({ success: false, message: "Audio generation stopped." });
          } else {
            res.status(500).json({ error: "Failed to generate audio file." });
          }
        }
      });

      ttsProcess.on("error", (error: any) => {
        processManager.removeProcess(processId);
        console.error("Error spawning Python script:", error);
        res
          .status(500)
          .json({ error: "Failed to start audio generation process." });
      });
    } catch (error) {
      processManager.removeProcess(processId);
      console.error("Error generating audio:", error);
      res.status(500).json({ error: "Failed to generate audio file." });
    }
  }
);

// Route to check if an audio file exists
router.get("/check-audio/:filename", (req: Request, res: Response): void => {
  const { filename } = req.params;

  if (!filename) {
    res.status(400).json({ error: "No filename provided." });
    return;
  }

  const result = audioFileExists(filename);
  res.json(result);
});

// Route to cleanup audio file after frontend has loaded it
router.post("/cleanup-audio", (req: Request, res: Response): void => {
  const { filename } = req.body;

  if (!filename) {
    res.status(400).json({ error: "No filename provided." });
    return;
  }

  try {
    const result = deleteAudioFile(filename);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Route to stop the current speech
router.post("/stop", (req: Request, res: Response): void => {
  const activeProcesses = processManager.getActiveTtsProcesses();

  if (activeProcesses.size > 0) {
    processManager.cleanupAllProcesses();
    res.status(200).json({ message: "All speech processes stopped." });
  } else {
    res.status(200).json({ message: "No active speech to stop." });
  }
});

// Route to cleanup distant audio files (2+ sentences away from current index)
router.post("/cleanup-distant-audio", (req: Request, res: Response): void => {
  const { currentSentenceIndex } = req.body;

  if (currentSentenceIndex === undefined || currentSentenceIndex === null) {
    res.status(400).json({ error: "No current sentence index provided." });
    return;
  }

  try {
    const result = cleanupDistantAudioFiles(currentSentenceIndex);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
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
