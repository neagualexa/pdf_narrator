import express, { Request, Response } from "express";
import multer from "multer";
import pdf from "pdf-parse";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import cors from "cors";
import crypto from "crypto";

// --- Basic Setup ---
const app = express();
const port = 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// Serve static audio files
app.use("/audio", express.static(path.join(__dirname, "../audio_files")));

// --- State Management ---
// Track active TTS processes for better resource management
const activeTtsProcesses = new Map<string, ChildProcess>();

// TTS Engine Selection
let currentTtsEngine: "pyttsx3" | "piper" = "piper"; // Default to Piper

// Cleanup function for old processes
function cleanupProcess(processId: string) {
  const process = activeTtsProcesses.get(processId);
  if (process) {
    try {
      process.kill("SIGTERM");
      setTimeout(() => {
        if (activeTtsProcesses.has(processId)) {
          const proc = activeTtsProcesses.get(processId);
          if (proc) {
            proc.kill("SIGKILL");
          }
          activeTtsProcesses.delete(processId);
        }
      }, 1000);
    } catch (error) {
      console.warn(`Failed to cleanup process ${processId}:`, error);
    } finally {
      activeTtsProcesses.delete(processId);
    }
  }
}

// Periodic cleanup of old audio files (older than 1 hour)
function cleanupOldAudioFiles() {
  const audioDir = path.join(__dirname, "../audio_files");
  const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds

  try {
    const files = fs.readdirSync(audioDir);
    const now = Date.now();

    files.forEach((file) => {
      const filePath = path.join(audioDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old audio file: ${file}`);
        }
      } catch (error) {
        console.warn(`Failed to check/delete file ${file}:`, error);
      }
    });
  } catch (error) {
    console.warn("Failed to cleanup old audio files:", error);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldAudioFiles, 30 * 60 * 1000);

/**
 * Helper function to run a Python script that returns data (like the sentence splitter).
 */
function runPythonScript(
  scriptPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    // Use the virtual environment Python
    const pythonPath = path.join(__dirname, "../../.venv/bin/python3");
    const pythonProcess = spawn(pythonPath, [scriptPath, ...args]);
    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

// --- API Routes ---

// Route to handle PDF file upload and text extraction
app.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    try {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);

      fs.unlinkSync(req.file.path);

      const result = await runPythonScript("sentence_splitter.py", [data.text]);

      if (result.code === 0) {
        const sentences = JSON.parse(result.stdout);
        res.json({ sentences });
      } else {
        console.error(`Sentence splitter script error:`, result.stderr);
        res
          .status(500)
          .json({ error: "Failed to execute sentence splitter script." });
      }
    } catch (error) {
      console.error("Error processing PDF:", error);
      res.status(500).json({ error: "Failed to process PDF file." });
    }
  }
);

// Route to generate audio with sentence index for smart caching
app.post("/generate-audio-indexed", (req: Request, res: Response): void => {
  const { sentence, speed, sentenceIndex, voiceId } = req.body;

  if (!sentence) {
    res.status(400).json({ error: "No sentence provided." });
    return;
  }

  // Check if audio file already exists for this sentence index and speed
  const expectedFilename = generateExpectedFilename(
    sentence,
    speed || 180,
    sentenceIndex,
    voiceId,
    currentTtsEngine
  );
  const audioPath = path.join(__dirname, "../audio_files", expectedFilename);

  // If file already exists, return it immediately
  if (fs.existsSync(audioPath)) {
    const audioUrl = `http://localhost:${port}/audio/${expectedFilename}`;
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
      currentTtsEngine === "piper"
        ? path.join(__dirname, "../generate_audio_piper.py")
        : path.join(__dirname, "../generate_audio.py");

    const args = [sentence];

    if (currentTtsEngine === "piper") {
      // Piper arguments: text, voice_id, speed, output_dir, sentence_index
      if (voiceId) {
        args.push(voiceId);
      } else {
        args.push("en_US-lessac-high"); // Default Piper voice
      }
      if (speed && typeof speed === "number") {
        // Convert pyttsx3 speed (words per minute) to Piper speed multiplier
        const piperSpeed = Math.min(2.0, Math.max(0.5, speed / 180));
        args.push(piperSpeed.toString());
      } else {
        args.push("1.0"); // Default speed
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
    const pythonPath = path.join(__dirname, "../../.venv/bin/python3");
    const ttsProcess = spawn(pythonPath, [scriptPath, ...args]);

    // Track the process
    activeTtsProcesses.set(processId, ttsProcess);

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
      activeTtsProcesses.delete(processId);

      if (code === 0) {
        try {
          const audioInfo = JSON.parse(stdout.trim());

          if (audioInfo.success) {
            // Return the audio file URL
            const audioUrl = `http://localhost:${port}/audio/${audioInfo.filename}`;
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
      activeTtsProcesses.delete(processId);
      console.error("Error spawning Python script:", error);
      res
        .status(500)
        .json({ error: "Failed to start audio generation process." });
    });
  } catch (error) {
    activeTtsProcesses.delete(processId);
    console.error("Error generating audio:", error);
    res.status(500).json({ error: "Failed to generate audio file." });
  }
});

// Helper function to generate expected filename for checking cache
function generateExpectedFilename(
  text: string,
  speed: number,
  sentenceIndex?: number,
  voiceId?: string,
  engine?: string
): string {
  const crypto = require("crypto");
  const textHash = crypto
    .createHash("md5")
    .update(`${text}_${speed}_${voiceId || "default"}_${engine || "pyttsx3"}`)
    .digest("hex")
    .substring(0, 8);

  const enginePrefix = engine === "piper" ? "piper_" : "";

  if (sentenceIndex !== undefined && sentenceIndex !== null) {
    return `${enginePrefix}speech_idx${sentenceIndex}_${textHash}.mp3`;
  } else {
    return `${enginePrefix}speech_${textHash}.mp3`;
  }
}

// Route to generate audio file from text (legacy endpoint)
app.post(
  "/generate-audio",
  async (req: Request, res: Response): Promise<void> => {
    const { sentence, speed } = req.body;

    if (!sentence) {
      res.status(400).json({ error: "No sentence provided." });
      return;
    }

    // Stop any existing TTS processes
    activeTtsProcesses.forEach((process, id) => {
      cleanupProcess(id);
    });

    const processId = crypto.randomUUID();

    try {
      // Call the Python script to generate audio file
      const scriptPath = path.join(__dirname, "../generate_audio.py");
      const args = [sentence];
      if (speed && typeof speed === "number") {
        args.push(speed.toString());
      }
      args.push("audio_files"); // output directory

      // Use the virtual environment Python and track the process
      const pythonPath = path.join(__dirname, "../../.venv/bin/python3");
      const ttsProcess = spawn(pythonPath, [scriptPath, ...args]);

      activeTtsProcesses.set(processId, ttsProcess);

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
        activeTtsProcesses.delete(processId);

        if (code === 0) {
          try {
            const audioInfo = JSON.parse(stdout.trim());

            if (audioInfo.success) {
              // Return the audio file URL
              const audioUrl = `http://localhost:${port}/audio/${audioInfo.filename}`;

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
        activeTtsProcesses.delete(processId);
        console.error("Error spawning Python script:", error);
        res
          .status(500)
          .json({ error: "Failed to start audio generation process." });
      });
    } catch (error) {
      activeTtsProcesses.delete(processId);
      console.error("Error generating audio:", error);
      res.status(500).json({ error: "Failed to generate audio file." });
    }
  }
);

// Route to check if an audio file exists
app.get("/check-audio/:filename", (req: Request, res: Response): void => {
  const { filename } = req.params;

  if (!filename) {
    res.status(400).json({ error: "No filename provided." });
    return;
  }

  const audioPath = path.join(__dirname, "../audio_files", filename);

  fs.access(audioPath, fs.constants.F_OK, (err) => {
    if (err) {
      res.json({ exists: false });
    } else {
      res.json({
        exists: true,
        audioUrl: `http://localhost:${port}/audio/${filename}`,
      });
    }
  });
});

// Route to cleanup audio file after frontend has loaded it
app.post("/cleanup-audio", (req: Request, res: Response): void => {
  const { filename } = req.body;

  if (!filename) {
    res.status(400).json({ error: "No filename provided." });
    return;
  }

  const audioPath = path.join(__dirname, "../audio_files", filename);

  fs.unlink(audioPath, (err) => {
    if (err) {
      if (err.code === "ENOENT") {
        // File doesn't exist - that's fine, it means it's already deleted
        res.json({ success: true, message: "Audio file was already deleted." });
      } else {
        // Other errors are actual problems
        console.error(`Failed to delete audio file ${filename}:`, err);
        res.status(500).json({ error: "Failed to delete audio file." });
      }
    } else {
      res.json({ success: true, message: "Audio file deleted successfully." });
    }
  });
});

// Route to stop the current speech
app.post("/stop", (req: Request, res: Response): void => {
  // Stop all active TTS processes
  if (activeTtsProcesses.size > 0) {
    activeTtsProcesses.forEach((process, id) => {
      cleanupProcess(id);
    });
    res.status(200).json({ message: "All speech processes stopped." });
  } else {
    res.status(200).json({ message: "No active speech to stop." });
  }
});

// Route to cleanup distant audio files (2+ sentences away from current index)
app.post("/cleanup-distant-audio", (req: Request, res: Response): void => {
  const { currentSentenceIndex } = req.body;

  if (currentSentenceIndex === undefined || currentSentenceIndex === null) {
    res.status(400).json({ error: "No current sentence index provided." });
    return;
  }

  const audioDir = path.join(__dirname, "../audio_files");

  try {
    // Read all files in the audio directory
    const files = fs.readdirSync(audioDir);
    const audioFiles = files.filter(
      (file) => file.startsWith("speech_idx") && file.endsWith(".mp3")
    );

    let deletedCount = 0;
    const deletedFiles: string[] = [];

    audioFiles.forEach((filename) => {
      // Extract sentence index from filename like "speech_idx3_abc123.mp3"
      const match = filename.match(/speech_idx(\d+)_/);
      if (match) {
        const fileIndex = parseInt(match[1]);
        const distance = Math.abs(fileIndex - currentSentenceIndex);

        // Only delete if 2+ sentences away (keep current + 1 before + 1 after)
        if (distance >= 2) {
          const filePath = path.join(audioDir, filename);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            deletedFiles.push(filename);
          } catch (deleteError) {
            if ((deleteError as any).code === "ENOENT") {
              // Audio file was already deleted
            } else {
              console.warn(`Failed to delete ${filename}:`, deleteError);
            }
          }
        }
      }
    });

    res.json({
      success: true,
      deletedCount,
      deletedFiles,
      message: `Cleaned up ${deletedCount} distant audio files.`,
    });
  } catch (error) {
    console.error("Error during distant audio cleanup:", error);
    res.status(500).json({ error: "Failed to cleanup distant audio files." });
  }
});

// Route to clear all audio cache files
app.post("/clear-audio-cache", (req: Request, res: Response): void => {
  const audioDir = path.join(__dirname, "../audio_files");

  try {
    // Read all files in the audio directory
    const files = fs.readdirSync(audioDir);
    const audioFiles = files.filter(
      (file) => file.endsWith(".mp3") || file.endsWith(".wav")
    );

    let deletedCount = 0;
    const deletedFiles: string[] = [];
    const failedFiles: string[] = [];

    audioFiles.forEach((filename) => {
      const filePath = path.join(audioDir, filename);
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
        deletedFiles.push(filename);
        console.log(`Cleared audio cache file: ${filename}`);
      } catch (deleteError) {
        if ((deleteError as any).code === "ENOENT") {
          // Audio file was already deleted
          deletedFiles.push(filename);
        } else {
          console.warn(`Failed to delete ${filename}:`, deleteError);
          failedFiles.push(filename);
        }
      }
    });

    res.json({
      success: true,
      deletedCount,
      deletedFiles,
      failedFiles,
      message: `Cleared ${deletedCount} audio cache files.`,
    });
  } catch (error) {
    console.error("Error during audio cache cleanup:", error);
    res.status(500).json({ error: "Failed to clear audio cache." });
  }
});

// Route to get available TTS voices
app.get("/voices", (req: Request, res: Response): void => {
  const getVoicesScript = path.join(__dirname, "../get_voices_combined.py");

  runPythonScript(getVoicesScript, [])
    .then(({ stdout, stderr, code }) => {
      if (code === 0 && stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success) {
            res.json({
              success: true,
              voices: result.voices,
              count: result.count,
              engines: result.engines,
              currentEngine: currentTtsEngine,
            });
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
app.get("/tts-engine", (req: Request, res: Response): void => {
  res.json({
    success: true,
    currentEngine: currentTtsEngine,
    availableEngines: ["pyttsx3", "piper"],
  });
});

app.post("/tts-engine", (req: Request, res: Response): void => {
  const { engine } = req.body;

  if (!engine || !["pyttsx3", "piper"].includes(engine)) {
    res.status(400).json({
      error: "Invalid engine. Must be 'pyttsx3' or 'piper'",
    });
    return;
  }

  currentTtsEngine = engine;
  res.json({
    success: true,
    currentEngine: currentTtsEngine,
    message: `TTS engine switched to ${engine}`,
  });
});

// Route to set the TTS engine
app.post("/set-tts-engine", (req: Request, res: Response): void => {
  const { engine } = req.body;

  if (engine !== "pyttsx3" && engine !== "piper") {
    res.status(400).json({ error: "Invalid TTS engine specified." });
    return;
  }

  currentTtsEngine = engine;

  res.json({ success: true, message: `TTS engine set to ${engine}.` });
});

// Route to get the current TTS engine
app.get("/current-tts-engine", (req: Request, res: Response): void => {
  res.json({ success: true, engine: currentTtsEngine });
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
