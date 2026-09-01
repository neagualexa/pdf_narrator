import { useCallback, useRef } from "react";
import * as api from "../api";
import { LOOKAHEAD } from "./useAudioCache";

export function useAudioManager() {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentPlayPromiseRef = useRef<Promise<void> | null>(null);
  const currentPlayAttemptRef = useRef<(() => void) | null>(null);

  // Audio elements that have been created and told to buffer ahead of time,
  // keyed by sentence index. Playing one of these is instant.
  const preparedRef = useRef<Map<number, HTMLAudioElement>>(new Map());

  const releasePrepared = useCallback((audio: HTMLAudioElement) => {
    // Drop the buffered data so the browser can reclaim it.
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  const clearPrepared = useCallback(() => {
    preparedRef.current.forEach(releasePrepared);
    preparedRef.current.clear();
  }, [releasePrepared]);

  const clearPreparedAt = useCallback(
    (index: number) => {
      const audio = preparedRef.current.get(index);
      if (audio) {
        releasePrepared(audio);
        preparedRef.current.delete(index);
      }
    },
    [releasePrepared],
  );

  /**
   * Creates the audio element for a sentence and starts buffering it while a
   * previous sentence is still playing, so the handoff at `ended` is instant.
   */
  const prepare = useCallback((index: number, audioUrl: string) => {
    if (preparedRef.current.has(index)) return;

    const audio = new Audio();
    audio.preload = "auto";
    audio.src = audioUrl;
    audio.playbackRate = 1.0;
    audio.load();
    preparedRef.current.set(index, audio);
  }, []);

  /**
   * Drops buffered elements outside the window the cache also keeps, so we can
   * never play an element whose backing file has been cleaned up server-side.
   */
  const prunePrepared = useCallback(
    (currentIndex: number) => {
      const keepFrom = currentIndex - 1;
      const keepTo = currentIndex + LOOKAHEAD;
      preparedRef.current.forEach((audio, preparedIndex) => {
        if (preparedIndex < keepFrom || preparedIndex > keepTo) {
          releasePrepared(audio);
          preparedRef.current.delete(preparedIndex);
        }
      });
    },
    [releasePrepared],
  );

  /**
   * Stops local playback without touching the backend, so in-flight prefetch
   * generation survives. Used for sentence-to-sentence transitions.
   */
  const stopLocalAudio = useCallback(() => {
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

  /**
   * Stops playback and kills any TTS generation on the backend. Only for
   * explicit user intent (stop / pause / manual navigation).
   */
  const stopCurrentAudio = useCallback(async () => {
    // Stop any active TTS generation process on the backend
    try {
      await api.stopAudio();
    } catch (stopError) {
      console.warn("Failed to stop backend TTS process:", stopError);
    }

    stopLocalAudio();
  }, [stopLocalAudio]);

  const playAudio = useCallback(
    async (
      index: number,
      audioUrl: string,
      filename: string,
      onEnded: () => void,
      onError: (error: string) => void,
    ): Promise<void> => {
      // Stop any currently playing audio (without killing backend prefetches)
      stopLocalAudio();

      // Create a unique ID for this play attempt
      let isCurrentPlayAttempt = true;
      currentPlayAttemptRef.current = () => {
        isCurrentPlayAttempt = false;
      };

      // Reuse the pre-buffered element for this sentence if we have one
      let audio = preparedRef.current.get(index);
      preparedRef.current.delete(index);
      if (audio && audio.src === audioUrl) {
        audio.currentTime = 0;
      } else {
        if (audio) releasePrepared(audio);
        audio = new Audio(audioUrl);
      }
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
    [stopLocalAudio, releasePrepared],
  );

  const cleanup = useCallback(() => {
    stopLocalAudio();
    clearPrepared();
  }, [stopLocalAudio, clearPrepared]);

  const getCurrentAudio = useCallback(() => currentAudioRef.current, []);

  return {
    playAudio,
    prepare,
    prunePrepared,
    clearPrepared,
    clearPreparedAt,
    stopLocalAudio,
    stopCurrentAudio,
    cleanup,
    getCurrentAudio,
  };
}
