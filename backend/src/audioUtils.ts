import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CONFIG } from "./config";
import { TtsEngine } from "./types";

/** Everything that changes what a sentence sounds like. */
export interface SpeechJob {
  engine: TtsEngine;
  text: string;
  voice: string;
  wpm: number;
}

/**
 * The one name a sentence's audio is stored under. Only this names audio
 * files, so a request can tell whether its audio already exists.
 */
export function audioFilename({ engine, text, voice, wpm }: SpeechJob): string {
  const hash = crypto
    .createHash("md5")
    .update(JSON.stringify([engine, voice, wpm, text]))
    .digest("hex")
    .substring(0, 12);
  return `${engine}_${hash}.mp3`;
}

export function audioUrl(filename: string): string {
  return `http://localhost:${CONFIG.PORT}/audio/${filename}`;
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
