import { ChildProcess } from "child_process";

export type TtsEngine = "pyttsx3" | "piper";

export interface AudioGenerationRequest {
  sentence: string;
  speed?: number;
  sentenceIndex?: number;
  voiceId?: string;
}

export interface AudioGenerationResponse {
  audioUrl: string;
  filename: string;
  cached: boolean;
}

export interface VoiceResponse {
  success: boolean;
  voices: any[];
  count: number;
  engines: any;
  currentEngine: TtsEngine;
}

export interface ProcessManager {
  activeTtsProcesses: Map<string, ChildProcess>;
  cleanupProcess: (processId: string) => void;
}

export interface PythonScriptResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
