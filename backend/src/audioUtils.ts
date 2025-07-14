import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CONFIG } from "./config";
import { TtsEngine } from "./types";

export function generateExpectedFilename(
  text: string,
  speed: number,
  sentenceIndex?: number,
  voiceId?: string,
  engine?: TtsEngine
): string {
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

export function cleanupOldAudioFiles(): void {
  const audioDir = CONFIG.AUDIO_DIR;
  const maxAge = CONFIG.CLEANUP.MAX_AGE_MS;

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

export function cleanupDistantAudioFiles(currentSentenceIndex: number): {
  success: boolean;
  deletedCount: number;
  deletedFiles: string[];
  message: string;
} {
  const audioDir = CONFIG.AUDIO_DIR;

  try {
    const files = fs.readdirSync(audioDir);
    const audioFiles = files.filter(
      (file) => file.startsWith("speech_idx") && file.endsWith(".mp3")
    );

    let deletedCount = 0;
    const deletedFiles: string[] = [];

    audioFiles.forEach((filename) => {
      const match = filename.match(/speech_idx(\d+)_/);
      if (match) {
        const fileIndex = parseInt(match[1]);
        const distance = Math.abs(fileIndex - currentSentenceIndex);

        if (distance >= CONFIG.DEFAULTS.CACHE_DISTANCE) {
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

    return {
      success: true,
      deletedCount,
      deletedFiles,
      message: `Cleaned up ${deletedCount} distant audio files.`,
    };
  } catch (error) {
    console.error("Error during distant audio cleanup:", error);
    throw new Error("Failed to cleanup distant audio files.");
  }
}

export function clearAllAudioCache(): {
  success: boolean;
  deletedCount: number;
  deletedFiles: string[];
  failedFiles: string[];
  message: string;
} {
  const audioDir = CONFIG.AUDIO_DIR;

  try {
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
          deletedFiles.push(filename);
        } else {
          console.warn(`Failed to delete ${filename}:`, deleteError);
          failedFiles.push(filename);
        }
      }
    });

    return {
      success: true,
      deletedCount,
      deletedFiles,
      failedFiles,
      message: `Cleared ${deletedCount} audio cache files.`,
    };
  } catch (error) {
    console.error("Error during audio cache cleanup:", error);
    throw new Error("Failed to clear audio cache.");
  }
}

export function audioFileExists(filename: string): {
  exists: boolean;
  audioUrl?: string;
} {
  const audioPath = path.join(CONFIG.AUDIO_DIR, filename);

  try {
    fs.accessSync(audioPath, fs.constants.F_OK);
    return {
      exists: true,
      audioUrl: `http://localhost:${CONFIG.PORT}/audio/${filename}`,
    };
  } catch {
    return { exists: false };
  }
}

export function deleteAudioFile(filename: string): {
  success: boolean;
  message: string;
} {
  const audioPath = path.join(CONFIG.AUDIO_DIR, filename);

  try {
    fs.unlinkSync(audioPath);
    return { success: true, message: "Audio file deleted successfully." };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { success: true, message: "Audio file was already deleted." };
    } else {
      console.error(`Failed to delete audio file ${filename}:`, err);
      throw new Error("Failed to delete audio file.");
    }
  }
}
