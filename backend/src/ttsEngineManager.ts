import { TtsEngine } from "./types";
import { CONFIG } from "./config";

const ENGINES: TtsEngine[] = ["pyttsx3", "piper"];

export class TtsEngineManager {
  private currentTtsEngine: TtsEngine = CONFIG.DEFAULTS.TTS_ENGINE;

  public getCurrentEngine(): TtsEngine {
    return this.currentTtsEngine;
  }

  public setEngine(engine: TtsEngine): void {
    if (!this.isValidEngine(engine)) {
      throw new Error(`Invalid engine. Must be one of: ${ENGINES.join(", ")}`);
    }
    this.currentTtsEngine = engine;
  }

  public isValidEngine(engine: string): engine is TtsEngine {
    return (ENGINES as string[]).includes(engine);
  }

  public getAvailableEngines(): TtsEngine[] {
    return [...ENGINES];
  }
}

export const ttsEngineManager = new TtsEngineManager();
