import React from "react";

// Centralized type definitions
export interface AudioCacheEntry {
  url: string;
  filename: string;
}

export interface AppState {
  sentences: string[];
  pdfFile: File | null;
  isLoading: boolean;
  error: string | null;
  generatingAudioIndex: number | null;
  speechSpeed: number;
  audioCache: Map<number, AudioCacheEntry>;
  isContinuousPlayback: boolean;
  selectedVoiceId: string | null;
  availableVoices: Voice[];
  voicesLoading: boolean;
  currentTtsEngine: "pyttsx3" | "piper";
  availableTtsEngines: string[];
}

export interface PlaybackState {
  status: "idle" | "playing";
  currentIndex: number;
}

export type PlaybackAction =
  | { type: "PLAY"; payload: number }
  | { type: "STOP" }
  | { type: "SET_INDEX"; payload: number }
  | { type: "RESET" };

export type AppAction =
  | { type: "SET_SENTENCES"; payload: string[] }
  | { type: "SET_PDF_FILE"; payload: File | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_GENERATING_AUDIO_INDEX"; payload: number | null }
  | { type: "SET_SPEECH_SPEED"; payload: number }
  | { type: "SET_AUDIO_CACHE"; payload: Map<number, AudioCacheEntry> }
  | { type: "ADD_TO_CACHE"; payload: { index: number; entry: AudioCacheEntry } }
  | { type: "REMOVE_FROM_CACHE"; payload: number }
  | { type: "CLEAR_CACHE" }
  | { type: "SET_CONTINUOUS_PLAYBACK"; payload: boolean }
  | { type: "SET_SELECTED_VOICE"; payload: string | null }
  | { type: "SET_AVAILABLE_VOICES"; payload: Voice[] }
  | { type: "SET_VOICES_LOADING"; payload: boolean }
  | { type: "SET_CURRENT_TTS_ENGINE"; payload: "pyttsx3" | "piper" }
  | { type: "SET_AVAILABLE_TTS_ENGINES"; payload: string[] }
  | { type: "RESET_ALL" };

export interface SentenceItemProps {
  sentence: string;
  index: number;
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
  isLastPlayed: boolean;
  isGeneratingAudio: boolean;
}

export interface FloatingControlsProps {
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onStop: () => void;
  isPlaying: boolean;
}

export interface ErrorMessageProps {
  message: string;
}

// Voice-related types
export interface Voice {
  id: string;
  name: string;
  languages: string[];
  gender: string;
  age: string;
  index: number;
  engine: string;
  type: string;
}

export interface VoiceControlsProps {
  selectedVoiceId: string | null;
  onVoiceChange: (voiceId: string) => void;
  speechSpeed: number;
  onSpeedChange: (speed: number) => void;
  voices: Voice[];
  isLoading: boolean;
  currentTtsEngine: "pyttsx3" | "piper";
  onTtsEngineChange: (engine: "pyttsx3" | "piper") => void;
}

// Re-export StyledButton types for convenience
export interface StyledButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  type?:
    | "primary"
    | "secondary"
    | "help"
    | "play-start"
    | "play-stop"
    | "play-loading"
    | "control"
    | "control-play-pause"
    | "control-stop"
    | "speed"
    | "engine"
    | "engine-active"
    | "voice-toggle";
  title?: string;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  loading?: boolean;
  active?: boolean;
}
