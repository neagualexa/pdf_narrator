import express from "express";
import path from "path";
import cors from "cors";
import { CONFIG } from "./config";
import { cleanupOldAudioFiles } from "./audioUtils";
import routes from "./routes";

// --- Basic Setup ---
const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Serve static audio files
app.use("/audio", express.static(CONFIG.AUDIO_DIR));

// --- Routes ---
app.use("/", routes);

// --- Cleanup Tasks ---
// Run cleanup every 30 minutes
setInterval(cleanupOldAudioFiles, CONFIG.CLEANUP.CLEANUP_INTERVAL_MS);

// --- Server Start ---
app.listen(CONFIG.PORT, () => {
  console.log(`Backend server running at http://localhost:${CONFIG.PORT}`);
  console.log(`Audio files served from: ${CONFIG.AUDIO_DIR}`);
  console.log(`Using Python at: ${CONFIG.PYTHON_PATH}`);
});
