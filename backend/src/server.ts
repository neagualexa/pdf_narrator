import express, { Request, Response } from "express";
import multer from "multer";
import pdf from "pdf-parse";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import cors from "cors";

// --- Basic Setup ---
const app = express();
const port = 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// --- State Management ---
// This variable will hold the currently active text-to-speech process.
let activeTtsProcess: ChildProcess | null = null;

/**
 * Helper function to run a Python script that returns data (like the sentence splitter).
 */
function runPythonScript(
  scriptPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const pythonProcess = spawn("python", [scriptPath, ...args]);
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

// Route to trigger the Python TTS script
app.post("/speak", (req: Request, res: Response): void => {
  const { sentence, speed } = req.body;

  if (!sentence) {
    res.status(400).json({ error: "No sentence provided." });
    return;
  }

  // If a TTS process is already running, kill it.
  if (activeTtsProcess) {
    console.log(
      `Stopping previous speech process (PID: ${activeTtsProcess.pid}).`
    );
    activeTtsProcess.kill();
  }

  // Spawn a new Python process for the new sentence with optional speed.
  const args = ["speak.py", sentence];
  if (speed && typeof speed === "number") {
    args.push(speed.toString());
  }
  activeTtsProcess = spawn("python", args);

  console.log(
    `Started new speech process (PID: ${
      activeTtsProcess.pid
    }) for sentence: "${sentence}"${speed ? ` at speed ${speed}` : ""}`
  );

  // **FIX:** Add null checks before attaching listeners to stdout and stderr.
  if (activeTtsProcess.stdout) {
    activeTtsProcess.stdout.on("data", (data) => {
      console.log(`[PID: ${activeTtsProcess?.pid}] stdout: ${data}`);
    });
  }

  if (activeTtsProcess.stderr) {
    activeTtsProcess.stderr.on("data", (data) => {
      console.error(`[PID: ${activeTtsProcess?.pid}] stderr: ${data}`);
    });
  }

  // When the process finishes, clear the active process variable.
  activeTtsProcess.on("close", (code) => {
    console.log(
      `Speech process (PID: ${activeTtsProcess?.pid}) finished with code ${code}.`
    );
    activeTtsProcess = null;
  });

  // Respond to the frontend immediately.
  res.status(200).json({ message: "Speech initiated successfully." });
});

// Route to stop the current speech
app.post("/stop", (req: Request, res: Response): void => {
  if (activeTtsProcess) {
    console.log(
      `Force stopping speech process (PID: ${activeTtsProcess.pid}) via stop endpoint.`
    );

    try {
      // Try graceful termination first
      activeTtsProcess.kill("SIGTERM");

      // Set a timeout for forceful kill if graceful doesn't work
      setTimeout(() => {
        if (activeTtsProcess) {
          console.log(
            `Force killing speech process (PID: ${activeTtsProcess.pid}) with SIGKILL.`
          );
          activeTtsProcess.kill("SIGKILL");
          activeTtsProcess = null;
        }
      }, 1000); // 1 second timeout
    } catch (error) {
      console.error("Error stopping speech process:", error);
      // Try force kill as fallback
      try {
        activeTtsProcess.kill("SIGKILL");
      } catch (forceError) {
        console.error("Error force killing speech process:", forceError);
      }
    }

    activeTtsProcess = null;
    res.status(200).json({ message: "Speech stopped forcefully." });
  } else {
    res.status(200).json({ message: "No active speech to stop." });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
