import { useState, useEffect, useReducer } from "react";

const API_URL = "http://localhost:3001";

// --- Reducer for Playback State ---
// This handles all the complex state transitions for playback.
type PlaybackState = {
  status: "idle" | "playing";
  currentIndex: number;
};

export type PlaybackAction =
  | { type: "PLAY"; payload: number }
  | { type: "STOP" }
  | { type: "SET_INDEX"; payload: number }
  | { type: "NEXT"; payload: { sentenceCount: number } }
  | { type: "PREVIOUS" }
  | { type: "RESET" };

function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case "PLAY":
      return { ...state, status: "playing", currentIndex: action.payload };
    case "STOP":
      return { ...state, status: "idle" };
    case "NEXT":
      const nextIndex = state.currentIndex + 1;
      if (nextIndex < action.payload.sentenceCount) {
        return { ...state, status: "playing", currentIndex: nextIndex };
      }
      return state;
    case "PREVIOUS":
      const prevIndex = state.currentIndex - 1;
      if (prevIndex >= 0) {
        return { ...state, status: "playing", currentIndex: prevIndex };
      }
      return state;
    case "RESET":
      return { status: "idle", currentIndex: 0 };
    default:
      return state;
  }
}

// --- Custom Hook for Speech Events ---
// This hook manages the real-time connection to the backend.
export function useSpeechEvents(dispatch: React.Dispatch<PlaybackAction>) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "speech_started") {
          dispatch({ type: "PLAY", payload: data.index });
        } else if (data.type === "speech_finished") {
          dispatch({ type: "STOP" });
        }
      } catch (e) {
        console.error("Failed to parse event data:", e);
      }
    };

    eventSource.onerror = () => {
      setError("Connection to the backend server failed.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [dispatch]);

  return { error, setError };
}

// --- Custom Hook for the PDF Processor ---
// This hook manages the state and logic related to the PDF file itself.
export function usePdfProcessor() {
  const [sentences, setSentences] = useState<string[]>([]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const processFile = async (file: File) => {
    setIsLoading(true);
    setSentences([]);

    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(URL.createObjectURL(file));

    // This is where you would call your API service to upload the file
    // For now, we'll just simulate it.
    // const data = await api.uploadPdf(file);
    // setSentences(data.sentences);

    setIsLoading(false);
  };

  return { sentences, pdfPreviewUrl, isLoading, processFile, setSentences };
}
