export type TtsEngine = "pyttsx3" | "piper";

export interface AudioGenerationRequest {
  sentence: string;
  /** Words per minute. */
  speed?: number;
  voiceId?: string;
}

export interface VoiceResponse {
  success: boolean;
  voices: any[];
  count: number;
  engines: any;
  currentEngine: TtsEngine;
}

export interface PythonScriptResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
