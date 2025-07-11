// Centralized type definitions
export interface AudioCacheEntry {
  url: string;
  filename: string;
}

export interface AppState {
  sentences: string[];
  pdfPreviewUrl: string | null;
  isLoading: boolean;
  error: string | null;
  generatingAudioIndex: number | null;
  speechSpeed: number;
  audioCache: Map<number, AudioCacheEntry>;
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
  | { type: "SET_PDF_PREVIEW_URL"; payload: string | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_GENERATING_AUDIO_INDEX"; payload: number | null }
  | { type: "SET_SPEECH_SPEED"; payload: number }
  | { type: "SET_AUDIO_CACHE"; payload: Map<number, AudioCacheEntry> }
  | { type: "ADD_TO_CACHE"; payload: { index: number; entry: AudioCacheEntry } }
  | { type: "REMOVE_FROM_CACHE"; payload: number }
  | { type: "CLEAR_CACHE" }
  | { type: "RESET_ALL" };

export interface SentenceItemProps {
  sentence: string;
  index: number;
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
  isGeneratingAudio: boolean;
}

export interface FloatingControlsProps {
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onStop: () => void;
  isPlaying: boolean;
  speechSpeed: number;
  onSpeedChange: (speed: number) => void;
}

export interface ErrorMessageProps {
  message: string;
}
