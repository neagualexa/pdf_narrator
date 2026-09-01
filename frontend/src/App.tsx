import React, { useReducer, useCallback, useEffect, useRef } from "react";
import { appReducer, initialAppState } from "./reducers/appReducer";
import {
  playbackReducer,
  initialPlaybackState,
} from "./reducers/playbackReducer";
import { useAudioManager } from "./hooks/useAudioManager";
import { useAudioCache, LOOKAHEAD } from "./hooks/useAudioCache";
import { AudioCacheEntry, PlaybackAction } from "./types";
import { LoadingSpinner, ErrorMessage } from "./components/LoadingSpinner";
import { SentenceItem } from "./components/SentenceItem";
import { FloatingControls } from "./components/FloatingControls";
import { VoiceControls } from "./components/VoiceControls";
import { PdfViewer } from "./components/PdfViewer";
import StyledButton from "./components/StyledButton";
import * as api from "./api";
import "./styles";

export default function App() {
  const [appState, dispatchApp] = useReducer(appReducer, initialAppState);
  const [playbackState, dispatchPlayback] = useReducer(
    playbackReducer,
    initialPlaybackState,
  );

  const {
    playAudio,
    prepare,
    prunePrepared,
    clearPrepared,
    clearPreparedAt,
    stopCurrentAudio,
    cleanup,
  } = useAudioManager();

  // Mirror the audio cache into app state so the UI can render from it; the
  // hook itself keeps the authoritative copy in a ref.
  const handleCacheChange = useCallback(
    (newCache: Map<number, AudioCacheEntry>) => {
      dispatchApp({ type: "SET_AUDIO_CACHE", payload: newCache });
    },
    [],
  );

  const {
    getCache,
    ensureAudio,
    prefetchAhead,
    clearCacheEntry,
    cleanupAllCache,
  } = useAudioCache(handleCacheChange);

  const {
    sentences,
    pdfFile,
    isLoading,
    error,
    generatingAudioIndex,
    speechSpeed,
    audioCache,
    isContinuousPlayback,
    selectedVoiceId,
    availableVoices,
    voicesLoading,
    currentTtsEngine,
    availableTtsEngines,
  } = appState;

  // Refs mirroring state that callbacks read, so handlePlay does not have to be
  // re-created (and re-arm stale closures) on every cache write.
  const playbackRef = useRef(playbackState);
  playbackRef.current = playbackState;

  // Dispatch that also updates the ref immediately, so callbacks firing before
  // the next render (e.g. auto-advance on "ended") see the true playback state.
  const dispatchPlaybackSync = useCallback((action: PlaybackAction) => {
    playbackRef.current = playbackReducer(playbackRef.current, action);
    dispatchPlayback(action);
  }, []);

  const isContinuousRef = useRef(isContinuousPlayback);
  isContinuousRef.current = isContinuousPlayback;

  // Lets the "ended" handler call the latest handlePlay without a dependency cycle.
  const handlePlayRef = useRef<
    ((index: number, isRetry?: boolean) => void) | undefined
  >(undefined);

  // Ref for the sentence list container to enable auto-scrolling
  const sentenceListRef = useRef<HTMLDivElement>(null);

  // Function to scroll the currently playing sentence to the center of the view
  const scrollToSentence = useCallback((index: number) => {
    if (!sentenceListRef.current) return;

    // Find the sentence element by its data attribute
    const sentenceElement = sentenceListRef.current.querySelector(
      `[data-sentence-index="${index}"]`,
    ) as HTMLElement;

    if (!sentenceElement) return;

    // Use scrollIntoView with block: 'center' for proper centering within the container
    sentenceElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, []);

  // File upload handler
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Clear error immediately when a new file is selected
      dispatchApp({ type: "SET_ERROR", payload: null });
      dispatchApp({ type: "SET_LOADING", payload: true });
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      dispatchPlaybackSync({ type: "RESET" });
      dispatchApp({ type: "SET_SENTENCES", payload: [] });

      // Store the PDF file for the viewer
      dispatchApp({
        type: "SET_PDF_FILE",
        payload: file,
      });

      try {
        const data = await api.uploadPdf(file);
        dispatchApp({ type: "SET_SENTENCES", payload: data.sentences });
      } catch (err) {
        dispatchApp({
          type: "SET_ERROR",
          payload:
            err instanceof Error ? err.message : "An unknown error occurred.",
        });
      } finally {
        dispatchApp({ type: "SET_LOADING", payload: false });
      }
    },
    [dispatchPlaybackSync],
  );

  // Kick off generation + buffering of the next sentences while the current one
  // plays, so the handoff at the end of a clip is instant. Fire-and-forget.
  const schedulePrefetch = useCallback(
    (index: number) => {
      prunePrepared(index);
      prefetchAhead(
        index,
        sentences,
        speechSpeed,
        selectedVoiceId,
        LOOKAHEAD,
        (readyIndex, entry) => prepare(readyIndex, entry.url),
      ).catch((err: any) => {
        console.warn("Prefetch failed:", err);
      });
    },
    [
      prefetchAhead,
      sentences,
      speechSpeed,
      selectedVoiceId,
      prepare,
      prunePrepared,
    ],
  );

  // Audio playback handler
  const handlePlay = useCallback(
    async (index: number, isRetry: boolean = false) => {
      if (!sentences[index]) return;

      const playback = playbackRef.current;

      // Allow switching to a different sentence even if currently playing
      const isSwitchingSentence =
        playback.status === "playing" && playback.currentIndex !== index;

      if (playback.status === "playing" && !isSwitchingSentence) {
        return;
      }

      try {
        const cachedAudio = !isRetry ? getCache().get(index) : null;

        // Only show the spinner on a genuine cache miss - prefetched sentences
        // should never flash it.
        if (!cachedAudio) {
          dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: index });
        }

        let entry;
        try {
          entry = await ensureAudio(
            index,
            sentences[index],
            speechSpeed,
            selectedVoiceId,
            { force: isRetry },
          );
        } finally {
          if (!cachedAudio) {
            dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
          }
        }

        if (!entry) {
          throw new Error("Failed to generate audio");
        }

        // Set playing state before starting audio
        dispatchPlaybackSync({ type: "PLAY", payload: index });

        // Start filling the buffer for the sentences after this one right away.
        schedulePrefetch(index);

        await playAudio(
          index,
          entry.url,
          entry.filename,
          () => {
            // On audio ended
            dispatchPlaybackSync({ type: "STOP" });

            // If in continuous playback mode, immediately play the next sentence
            if (isContinuousRef.current && index + 1 < sentences.length) {
              handlePlayRef.current?.(index + 1);
            } else if (
              isContinuousRef.current &&
              index + 1 >= sentences.length
            ) {
              // Reached the end, disable continuous playback
              dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
            }
          },
          (errorMessage: string) => {
            // On audio error
            dispatchPlaybackSync({ type: "STOP" });

            // If this was cached audio that failed and it's not already a retry,
            // try regenerating once
            if (cachedAudio && !isRetry) {
              clearCacheEntry(index);
              clearPreparedAt(index);
              handlePlayRef.current?.(index, true);
              return;
            }

            dispatchApp({ type: "SET_ERROR", payload: errorMessage });
          },
        );
      } catch (err: any) {
        dispatchPlaybackSync({ type: "STOP" });
        dispatchApp({ type: "SET_ERROR", payload: err.message });
      }
    },
    [
      sentences,
      speechSpeed,
      selectedVoiceId,
      getCache,
      ensureAudio,
      playAudio,
      schedulePrefetch,
      clearCacheEntry,
      clearPreparedAt,
      dispatchPlaybackSync,
    ],
  );

  handlePlayRef.current = handlePlay;

  const handleStop = useCallback(async () => {
    try {
      // Disable continuous playback
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });

      // Stop current audio playback
      await stopCurrentAudio();

      // Clear frontend cache
      console.log("Clearing frontend audio cache...");
      cleanupAllCache();
      clearPrepared();

      // Clear backend cache
      console.log("Clearing backend audio cache...");
      const result = await api.clearAudioCache();
      console.log(`Backend cache cleared: ${result.message}`);

      // Reset states
      dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
      dispatchPlaybackSync({ type: "STOP" });
    } catch (error) {
      console.error("Error during cache reset:", error);
      // Still reset the states even if cache clearing fails
      dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
      dispatchPlaybackSync({ type: "STOP" });
    }
  }, [stopCurrentAudio, cleanupAllCache, clearPrepared, dispatchPlaybackSync]);

  // Simple pause function that doesn't clear cache
  const handlePause = useCallback(async () => {
    try {
      // Disable continuous playback
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });

      // Stop current audio playback without clearing cache
      await stopCurrentAudio();
      dispatchPlaybackSync({ type: "STOP" });
    } catch (error) {
      console.error("Error during pause:", error);
      dispatchPlaybackSync({ type: "STOP" });
    }
  }, [stopCurrentAudio, dispatchPlaybackSync]);

  const handlePlayPause = useCallback(() => {
    if (playbackState.status === "playing") {
      // If currently playing, just stop audio without clearing cache
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      stopCurrentAudio();
      dispatchPlaybackSync({ type: "STOP" });
    } else if (sentences.length > 0) {
      // Start continuous playback from current position
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: true });
      handlePlay(playbackState.currentIndex);
    }
  }, [
    playbackState,
    sentences,
    handlePlay,
    stopCurrentAudio,
    dispatchPlaybackSync,
  ]);

  const handleNext = useCallback(() => {
    const nextIndex = playbackState.currentIndex + 1;
    if (nextIndex < sentences.length) {
      // Disable continuous playback when manually navigating (but don't clear cache)
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      handlePlay(nextIndex);
    }
  }, [playbackState, sentences, handlePlay]);

  const handlePrevious = useCallback(() => {
    const prevIndex = playbackState.currentIndex - 1;
    if (prevIndex >= 0) {
      // Disable continuous playback when manually navigating (but don't clear cache)
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      handlePlay(prevIndex);
    }
  }, [playbackState, handlePlay]);

  const handleSpeedChange = useCallback((speed: number) => {
    dispatchApp({ type: "SET_SPEECH_SPEED", payload: speed });
  }, []);

  const handleVoiceChange = useCallback((voiceId: string) => {
    dispatchApp({ type: "SET_SELECTED_VOICE", payload: voiceId });
  }, []);

  // Stable cleanup function to avoid dependencies issues
  const stableCleanupCache = useCallback(() => {
    // Prepared elements hold audio generated at the old speed/voice, so they
    // have to go whenever the cache does.
    clearPrepared();
    cleanupAllCache();
  }, [cleanupAllCache, clearPrepared]);

  const handleTtsEngineChange = useCallback(
    async (engine: "pyttsx3" | "piper") => {
      try {
        // Clear cache when switching engines
        stableCleanupCache();

        // Update the backend TTS engine
        await api.setTtsEngine(engine);

        // Update the frontend state
        dispatchApp({ type: "SET_CURRENT_TTS_ENGINE", payload: engine });

        // Clear the selected voice as it might not be available in the new engine
        dispatchApp({ type: "SET_SELECTED_VOICE", payload: null });

        // Reload voices for the new engine
        dispatchApp({ type: "SET_VOICES_LOADING", payload: true });
        const voicesData = await api.getAvailableVoices();
        if (voicesData.success) {
          dispatchApp({
            type: "SET_AVAILABLE_VOICES",
            payload: voicesData.voices,
          });

          // Set the first voice of the new engine as default
          const newEngineVoices = voicesData.voices.filter(
            (v) => v.engine === engine,
          );
          if (newEngineVoices.length > 0) {
            let defaultVoice = newEngineVoices[0];

            // If switching to Piper, try to find Cori voice
            if (engine === "piper") {
              const coriVoice = newEngineVoices.find((v) =>
                v.id.toLowerCase().includes("cori"),
              );
              if (coriVoice) {
                defaultVoice = coriVoice;
              }
            }

            dispatchApp({
              type: "SET_SELECTED_VOICE",
              payload: defaultVoice.id,
            });
          }
        }
      } catch (error) {
        console.error("Error switching TTS engine:", error);
      } finally {
        dispatchApp({ type: "SET_VOICES_LOADING", payload: false });
      }
    },
    [stableCleanupCache],
  );

  const handleDismissError = useCallback(() => {
    dispatchApp({ type: "SET_ERROR", payload: null });
  }, []);

  // Clear cache when speech speed changes
  useEffect(() => {
    stableCleanupCache();
  }, [speechSpeed, stableCleanupCache]);

  // Clear cache when sentences change (new PDF uploaded)
  useEffect(() => {
    stableCleanupCache();
  }, [sentences.length, stableCleanupCache]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      cleanupAllCache();
    };
  }, [cleanup, cleanupAllCache]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle arrow keys if we have sentences
      if (sentences.length === 0) return;

      // Prevent default behavior for arrow keys to avoid page scrolling
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
      }

      switch (event.key) {
        case "ArrowLeft":
          handlePrevious();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case " ": // Spacebar for play/pause
          event.preventDefault();
          handlePlayPause();
          break;
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sentences.length, handleNext, handlePrevious, handlePlayPause]);

  // Load available voices and TTS engine info on component mount
  useEffect(() => {
    async function loadVoices() {
      try {
        dispatchApp({ type: "SET_VOICES_LOADING", payload: true });

        // Get current TTS engine
        const engineData = await api.getTtsEngine();
        if (engineData.success) {
          dispatchApp({
            type: "SET_CURRENT_TTS_ENGINE",
            payload: engineData.currentEngine as "pyttsx3" | "piper",
          });
          dispatchApp({
            type: "SET_AVAILABLE_TTS_ENGINES",
            payload: engineData.availableEngines,
          });
        }

        // Get available voices
        const voicesData = await api.getAvailableVoices();
        if (voicesData.success) {
          dispatchApp({
            type: "SET_AVAILABLE_VOICES",
            payload: voicesData.voices,
          });

          // Set the first voice as default if none selected
          if (!selectedVoiceId && voicesData.voices.length > 0) {
            // Find the first voice for the current engine
            const currentEngineVoices = voicesData.voices.filter(
              (v) => v.engine === voicesData.currentEngine,
            );

            if (currentEngineVoices.length > 0) {
              let defaultVoice = currentEngineVoices[0];

              // If using Piper, try to find Cori voice
              if (voicesData.currentEngine === "piper") {
                const coriVoice = currentEngineVoices.find((v) =>
                  v.id.toLowerCase().includes("cori"),
                );
                if (coriVoice) {
                  defaultVoice = coriVoice;
                }
              }

              dispatchApp({
                type: "SET_SELECTED_VOICE",
                payload: defaultVoice.id,
              });
            } else {
              // Fallback to first voice
              dispatchApp({
                type: "SET_SELECTED_VOICE",
                payload: voicesData.voices[0].id,
              });
            }
          }
        } else {
          console.warn("Failed to load voices:", voicesData);
        }
      } catch (error) {
        console.error("Error loading voices:", error);
      } finally {
        dispatchApp({ type: "SET_VOICES_LOADING", payload: false });
      }
    }

    loadVoices();
  }, [selectedVoiceId]);

  // Auto-scroll to the currently playing sentence
  useEffect(() => {
    if (playbackState.status === "playing" && playbackState.currentIndex >= 0) {
      // Add a small delay to ensure the DOM has updated with the new playing state
      const timeoutId = setTimeout(() => {
        scrollToSentence(playbackState.currentIndex);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [playbackState.status, playbackState.currentIndex, scrollToSentence]);

  return (
    <div className="app-wrapper">
      {isLoading && <LoadingSpinner />}

      {/* Voice Controls Panel */}
      <VoiceControls
        selectedVoiceId={selectedVoiceId}
        onVoiceChange={handleVoiceChange}
        speechSpeed={speechSpeed}
        onSpeedChange={handleSpeedChange}
        voices={availableVoices}
        isLoading={voicesLoading}
        currentTtsEngine={currentTtsEngine}
        onTtsEngineChange={handleTtsEngineChange}
      />

      <div className="container">
        <div className="card">
          <h1 className="title">PDF to Audio Converter</h1>

          <div className="main-content">
            <div className="left-column">
              <div className="upload-box">
                <StyledButton
                  type="upload"
                  onClick={() =>
                    document.getElementById("file-upload")?.click()
                  }
                >
                  Select PDF to Upload
                </StyledButton>
                <input
                  id="file-upload"
                  type="file"
                  name="file"
                  accept="application/pdf"
                  required
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <p className="upload-text">
                  The conversion will start automatically.
                </p>
              </div>

              {sentences.length > 0 && (
                <div id="results-container">
                  <h2 className="results-title">Extracted Sentences</h2>
                  <div className="sentence-list" ref={sentenceListRef}>
                    {sentences.map((sentence, index) => (
                      <SentenceItem
                        key={index}
                        sentence={sentence}
                        index={index}
                        onPlay={() => {
                          // Disable continuous playback when manually selecting a sentence
                          dispatchApp({
                            type: "SET_CONTINUOUS_PLAYBACK",
                            payload: false,
                          });
                          handlePlay(index);
                        }}
                        onStop={handlePause}
                        isPlaying={
                          playbackState.status === "playing" &&
                          playbackState.currentIndex === index
                        }
                        isLastPlayed={playbackState.currentIndex === index}
                        isGeneratingAudio={generatingAudioIndex === index}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="right-column">
              <div className="pdf-preview-container">
                <PdfViewer file={pdfFile} className="pdf-preview-iframe" />
              </div>

              {/* Cache Status Display */}
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              >
                <div style={{ fontSize: "0.9rem", color: "#666" }}>
                  Cache Status: {audioCache.size} sentences cached
                </div>
              </div>

              {error && (
                <ErrorMessage message={error} onDismiss={handleDismissError} />
              )}
            </div>
          </div>
        </div>
        {sentences.length > 0 && (
          <FloatingControls
            onPlayPause={handlePlayPause}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onStop={handleStop}
            isPlaying={playbackState.status === "playing"}
          />
        )}
        <footer className="footer">
          <p>
            React Frontend | Node.js & Python Backend | TTS Engine | Created
            with Claude Sonnet 4
          </p>
        </footer>
      </div>
    </div>
  );
}
