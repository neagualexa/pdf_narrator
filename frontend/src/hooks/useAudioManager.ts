import { useCallback, useRef } from "react";
import * as api from "../api";

export function useAudioManager() {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentPlayPromiseRef = useRef<Promise<void> | null>(null);
  const currentPlayAttemptRef = useRef<(() => void) | null>(null);

  const stopCurrentAudio = useCallback(async () => {
    // Stop any active TTS generation process on the backend
    try {
      await api.stopAudio();
    } catch (stopError) {
      console.warn("Failed to stop backend TTS process:", stopError);
    }

    // Clear any pending play promise
    currentPlayPromiseRef.current = null;

    // Stop current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }

    // Mark any previous play attempt as superseded
    if (currentPlayAttemptRef.current) {
      currentPlayAttemptRef.current();
      currentPlayAttemptRef.current = null;
    }
  }, []);

  const playAudio = useCallback(
    async (
      audioUrl: string,
      filename: string,
      onEnded: () => void,
      onError: (error: string) => void
    ): Promise<void> => {
      // Stop any currently playing audio
      await stopCurrentAudio();

      // Create a unique ID for this play attempt
      let isCurrentPlayAttempt = true;
      currentPlayAttemptRef.current = () => {
        isCurrentPlayAttempt = false;
      };

      // Create and configure audio element
      const audio = new Audio(audioUrl);
      audio.playbackRate = 1.0;

      // Set up event listeners
      audio.addEventListener("ended", () => {
        if (isCurrentPlayAttempt) {
          currentAudioRef.current = null;
          onEnded();
        }
      });

      audio.addEventListener("error", (event) => {
        if (isCurrentPlayAttempt) {
          console.error("Audio error event:", event);
          currentAudioRef.current = null;
          onError("Failed to play audio");

          // Cleanup the audio file from server
          api.cleanupAudio(filename).catch((err) => {
            console.warn("Failed to cleanup audio file:", err);
          });
        }
      });

      // Start playback
      currentAudioRef.current = audio;

      // Handle play promise properly to avoid race conditions
      const playPromise = audio.play();
      currentPlayPromiseRef.current = playPromise;

      try {
        await playPromise;
      } catch (playError: any) {
        if (isCurrentPlayAttempt) {
          // Check if error is due to interruption (which is expected behavior)
          if (
            playError.name === "AbortError" ||
            playError.message.includes("interrupted")
          ) {
            // Audio play was interrupted (this is normal when switching sentences)
          } else {
            console.error("Audio play failed:", playError);
            onError("Failed to play audio: " + playError.message);
          }
        }
      } finally {
        // Clear the play promise if it's still the current one
        if (playPromise === currentPlayPromiseRef.current) {
          currentPlayPromiseRef.current = null;
        }
      }
    },
    [stopCurrentAudio]
  );

  const cleanup = useCallback(() => {
    // Clear any pending play promise
    currentPlayPromiseRef.current = null;

    // Stop current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }

    // Clear play attempt
    if (currentPlayAttemptRef.current) {
      currentPlayAttemptRef.current();
      currentPlayAttemptRef.current = null;
    }
  }, []);

  return {
    playAudio,
    stopCurrentAudio,
    cleanup,
    getCurrentAudio: () => currentAudioRef.current,
  };
}
