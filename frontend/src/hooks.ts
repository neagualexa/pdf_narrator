// This file contains legacy hooks that are no longer used in the refactored app
// The functionality has been moved to:
// - types.ts for type definitions
// - reducers/appReducer.ts and reducers/playbackReducer.ts for state management
// - hooks/useAudioManager.ts for audio management
// - hooks/useAudioCache.ts for cache management

// This file is kept for backward compatibility but should not be used in new code

import { useState, useEffect } from "react";

const API_URL = "http://localhost:3001";

export type PlaybackAction =
  | { type: "PLAY"; payload: number }
  | { type: "STOP" }
  | { type: "SET_INDEX"; payload: number }
  | { type: "RESET" };

// Legacy hook - replaced by centralized error handling in App component
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
