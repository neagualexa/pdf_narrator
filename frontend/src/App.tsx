import React, { useReducer, useCallback, useEffect, useRef } from "react";
import { appReducer, initialAppState } from "./reducers/appReducer";
import {
  playbackReducer,
  initialPlaybackState,
} from "./reducers/playbackReducer";
import { useAudioManager } from "./hooks/useAudioManager";
import { useAudioCache } from "./hooks/useAudioCache";
import { LoadingSpinner, ErrorMessage } from "./components/LoadingSpinner";
import { SentenceItem } from "./components/SentenceItem";
import { FloatingControls } from "./components/FloatingControls";
import { VoiceControls } from "./components/VoiceControls";
import { PdfViewer } from "./components/PdfViewer";
import * as api from "./api";
import "./App.css";

export default function App() {
  const [appState, dispatchApp] = useReducer(appReducer, initialAppState);
  const [playbackState, dispatchPlayback] = useReducer(
    playbackReducer,
    initialPlaybackState
  );

  const { playAudio, stopCurrentAudio, cleanup } = useAudioManager();
  const {
    clearCacheEntry,
    generateAudioForSentence,
    preloadAdjacentSentences,
    cleanupAllCache,
  } = useAudioCache();

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

  // Use ref to track current cache for cleanup without causing re-renders
  const audioCacheRef = useRef(audioCache);
  audioCacheRef.current = audioCache;

  // Ref for the sentence list container to enable auto-scrolling
  const sentenceListRef = useRef<HTMLDivElement>(null);

  // Function to scroll the currently playing sentence to the center of the view
  const scrollToSentence = useCallback((index: number) => {
    if (!sentenceListRef.current) return;

    // Find the sentence element by its data attribute
    const sentenceElement = sentenceListRef.current.querySelector(
      `[data-sentence-index="${index}"]`
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
      dispatchPlayback({ type: "RESET" });
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
    []
  );

  // Audio playback handler
  const handlePlay = useCallback(
    async (index: number, isRetry: boolean = false) => {
      if (!sentences[index]) return;

      // Allow switching to a different sentence even if currently playing
      const isSwitchingSentence =
        playbackState.status === "playing" &&
        playbackState.currentIndex !== index;

      if (playbackState.status === "playing" && !isSwitchingSentence) {
        return;
      }

      // Prevent multiple audio generation attempts for the same sentence
      if (generatingAudioIndex === index) {
        return;
      }

      try {
        let audioUrl: string;
        let filename: string;

        // Check if audio is already cached (but skip cache if this is a retry)
        const cachedAudio = !isRetry ? audioCache.get(index) : null;
        if (cachedAudio) {
          audioUrl = cachedAudio.url;
          filename = cachedAudio.filename;
        } else {
          // Not cached or retry, generate it
          dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: index });

          try {
            const audioUrlResult = await generateAudioForSentence(
              sentences[index],
              speechSpeed,
              index,
              audioCache,
              (newCache) =>
                dispatchApp({ type: "SET_AUDIO_CACHE", payload: newCache }),
              selectedVoiceId
            );

            if (!audioUrlResult) {
              throw new Error("Failed to generate audio");
            }

            audioUrl = audioUrlResult;
            // Get the filename from the latest cache
            const latestEntry = audioCache.get(index);
            filename = latestEntry?.filename || "";
          } finally {
            dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
          }
        }

        // Set playing state before starting audio
        dispatchPlayback({ type: "PLAY", payload: index });

        await playAudio(
          audioUrl,
          filename,
          () => {
            // On audio ended
            dispatchPlayback({ type: "STOP" }); // If in continuous playback mode, automatically play next sentence
            if (isContinuousPlayback && index + 1 < sentences.length) {
              // Use setTimeout to avoid recursive calls and allow state to update
              setTimeout(() => {
                handlePlay(index + 1);
              }, 100);
            } else if (isContinuousPlayback && index + 1 >= sentences.length) {
              // Reached the end, disable continuous playback
              dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
            }

            // Preload adjacent sentences for smooth navigation
            preloadAdjacentSentences(
              index,
              sentences,
              audioCache,
              speechSpeed,
              (newCache) =>
                dispatchApp({ type: "SET_AUDIO_CACHE", payload: newCache }),
              selectedVoiceId
            ).catch((err: any) => {
              console.warn("Post-playback preload failed:", err);
            });
          },
          (errorMessage: string) => {
            // On audio error
            dispatchPlayback({ type: "STOP" });

            // If this was cached audio that failed and it's not already a retry, try regenerating once
            if (cachedAudio && !isRetry) {
              clearCacheEntry(audioCache, index, (newCache) =>
                dispatchApp({ type: "SET_AUDIO_CACHE", payload: newCache })
              );

              // Try regenerating the audio once
              handlePlay(index, true);
              return;
            }

            dispatchApp({ type: "SET_ERROR", payload: errorMessage });
          }
        );
      } catch (err: any) {
        dispatchPlayback({ type: "STOP" });
        dispatchApp({ type: "SET_ERROR", payload: err.message });
      }
    },
    [
      sentences,
      speechSpeed,
      playbackState,
      generatingAudioIndex,
      audioCache,
      isContinuousPlayback,
      selectedVoiceId,
      playAudio,
      generateAudioForSentence,
      preloadAdjacentSentences,
      clearCacheEntry,
    ]
  );

  const handleStop = useCallback(async () => {
    try {
      // Disable continuous playback
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });

      // Stop current audio playback
      await stopCurrentAudio();

      // Clear frontend cache
      if (audioCacheRef.current.size > 0) {
        console.log("Clearing frontend audio cache...");
        cleanupAllCache(audioCacheRef.current);
        dispatchApp({ type: "CLEAR_CACHE" });
      }

      // Clear backend cache
      console.log("Clearing backend audio cache...");
      const result = await api.clearAudioCache();
      console.log(`Backend cache cleared: ${result.message}`);

      // Reset states
      dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
      dispatchPlayback({ type: "STOP" });
    } catch (error) {
      console.error("Error during cache reset:", error);
      // Still reset the states even if cache clearing fails
      dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
      dispatchPlayback({ type: "STOP" });
    }
  }, [stopCurrentAudio, cleanupAllCache]);

  // Simple pause function that doesn't clear cache
  const handlePause = useCallback(async () => {
    try {
      // Disable continuous playback
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });

      // Stop current audio playback without clearing cache
      await stopCurrentAudio();
      dispatchPlayback({ type: "STOP" });
    } catch (error) {
      console.error("Error during pause:", error);
      dispatchPlayback({ type: "STOP" });
    }
  }, [stopCurrentAudio]);

  const handlePlayPause = useCallback(() => {
    if (playbackState.status === "playing") {
      // If currently playing, just stop audio without clearing cache
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      stopCurrentAudio();
      dispatchPlayback({ type: "STOP" });
    } else if (sentences.length > 0) {
      // Start continuous playback from current position
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: true });
      handlePlay(playbackState.currentIndex);
    }
  }, [playbackState, sentences, handlePlay, stopCurrentAudio]);

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
    if (audioCacheRef.current.size > 0) {
      cleanupAllCache(audioCacheRef.current);
      dispatchApp({ type: "CLEAR_CACHE" });
    }
  }, [cleanupAllCache]);

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
            (v) => v.engine === engine
          );
          if (newEngineVoices.length > 0) {
            let defaultVoice = newEngineVoices[0];

            // If switching to Piper, try to find Cori voice
            if (engine === "piper") {
              const coriVoice = newEngineVoices.find((v) =>
                v.id.toLowerCase().includes("cori")
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
    [stableCleanupCache]
  );

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
      if (audioCacheRef.current.size > 0) {
        cleanupAllCache(audioCacheRef.current);
      }
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
              (v) => v.engine === voicesData.currentEngine
            );

            if (currentEngineVoices.length > 0) {
              let defaultVoice = currentEngineVoices[0];

              // If using Piper, try to find Cori voice
              if (voicesData.currentEngine === "piper") {
                const coriVoice = currentEngineVoices.find((v) =>
                  v.id.toLowerCase().includes("cori")
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
                <label htmlFor="file-upload" className="upload-label">
                  Select PDF to Upload
                </label>
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

              {error && <ErrorMessage message={error} />}
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
