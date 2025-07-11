import { AppState, AppAction } from "../types";

export const initialAppState: AppState = {
  sentences: [],
  pdfPreviewUrl: null,
  isLoading: false,
  error: null,
  generatingAudioIndex: null,
  speechSpeed: 160,
  audioCache: new Map(),
  isContinuousPlayback: false,
  selectedVoiceId: null,
  availableVoices: [],
  voicesLoading: false,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SENTENCES":
      return { ...state, sentences: action.payload };
    case "SET_PDF_PREVIEW_URL":
      return { ...state, pdfPreviewUrl: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_GENERATING_AUDIO_INDEX":
      return { ...state, generatingAudioIndex: action.payload };
    case "SET_SPEECH_SPEED":
      return { ...state, speechSpeed: action.payload };
    case "SET_AUDIO_CACHE":
      return { ...state, audioCache: action.payload };
    case "ADD_TO_CACHE":
      const newCache = new Map(state.audioCache);
      newCache.set(action.payload.index, action.payload.entry);
      return { ...state, audioCache: newCache };
    case "REMOVE_FROM_CACHE":
      const cacheWithoutItem = new Map(state.audioCache);
      cacheWithoutItem.delete(action.payload);
      return { ...state, audioCache: cacheWithoutItem };
    case "CLEAR_CACHE":
      return { ...state, audioCache: new Map() };
    case "SET_CONTINUOUS_PLAYBACK":
      return { ...state, isContinuousPlayback: action.payload };
    case "SET_SELECTED_VOICE":
      return { ...state, selectedVoiceId: action.payload };
    case "SET_AVAILABLE_VOICES":
      return { ...state, availableVoices: action.payload };
    case "SET_VOICES_LOADING":
      return { ...state, voicesLoading: action.payload };
    case "RESET_ALL":
      return {
        ...initialAppState,
        speechSpeed: state.speechSpeed,
        selectedVoiceId: state.selectedVoiceId,
        availableVoices: state.availableVoices,
      };
    default:
      return state;
  }
}
