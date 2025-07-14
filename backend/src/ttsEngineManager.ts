import { TtsEngine } from "./types";
import { CONFIG } from "./config";

export class TtsEngineManager {
  private currentTtsEngine: TtsEngine = CONFIG.DEFAULTS.TTS_ENGINE;

  public getCurrentEngine(): TtsEngine {
    return this.currentTtsEngine;
  }

  public setEngine(engine: TtsEngine): void {
    if (!["pyttsx3", "piper"].includes(engine)) {
      throw new Error("Invalid engine. Must be 'pyttsx3' or 'piper'");
    }
    this.currentTtsEngine = engine;
  }

  public isValidEngine(engine: string): engine is TtsEngine {
    return ["pyttsx3", "piper"].includes(engine);
  }

  public getAvailableEngines(): TtsEngine[] {
    return ["pyttsx3", "piper"];
  }
}

export const ttsEngineManager = new TtsEngineManager();
