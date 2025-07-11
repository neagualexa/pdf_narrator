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
    pdfPreviewUrl,
    isLoading,
    error,
    generatingAudioIndex,
    speechSpeed,
    audioCache,
  } = appState;

  // Use ref to track current cache for cleanup without causing re-renders
  const audioCacheRef = useRef(audioCache);
  audioCacheRef.current = audioCache;

  // File upload handler
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      dispatchApp({ type: "SET_LOADING", payload: true });
      dispatchApp({ type: "SET_ERROR", payload: null });
      dispatchPlayback({ type: "RESET" });
      dispatchApp({ type: "SET_SENTENCES", payload: [] });

      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
      dispatchApp({
        type: "SET_PDF_PREVIEW_URL",
        payload: URL.createObjectURL(file),
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
    [pdfPreviewUrl]
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
                dispatchApp({ type: "SET_AUDIO_CACHE", payload: newCache })
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
            dispatchPlayback({ type: "STOP" });

            // Preload adjacent sentences for smooth navigation
            preloadAdjacentSentences(
              index,
              sentences,
              audioCache,
              speechSpeed,
              (newCache) =>
                dispatchApp({ type: "SET_AUDIO_CACHE", payload: newCache })
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
      playAudio,
      generateAudioForSentence,
      preloadAdjacentSentences,
      clearCacheEntry,
    ]
  );

  const handleStop = useCallback(async () => {
    try {
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

  const handlePlayPause = useCallback(() => {
    if (playbackState.status === "playing") {
      handleStop();
    } else if (sentences.length > 0) {
      handlePlay(playbackState.currentIndex);
    }
  }, [playbackState, sentences, handlePlay, handleStop]);

  const handleNext = useCallback(() => {
    const nextIndex = playbackState.currentIndex + 1;
    if (nextIndex < sentences.length) {
      handlePlay(nextIndex);
    }
  }, [playbackState, sentences, handlePlay]);

  const handlePrevious = useCallback(() => {
    const prevIndex = playbackState.currentIndex - 1;
    if (prevIndex >= 0) {
      handlePlay(prevIndex);
    }
  }, [playbackState, handlePlay]);

  const handleSpeedChange = useCallback((speed: number) => {
    dispatchApp({ type: "SET_SPEECH_SPEED", payload: speed });
  }, []);

  // Stable cleanup function to avoid dependencies issues
  const stableCleanupCache = useCallback(() => {
    if (audioCacheRef.current.size > 0) {
      cleanupAllCache(audioCacheRef.current);
      dispatchApp({ type: "CLEAR_CACHE" });
    }
  }, [cleanupAllCache]);

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

  return (
    <div className="app-wrapper">
      {isLoading && <LoadingSpinner />}
      <div className="container">
        <div className="card">
          <h1 className="title">PDF to Audio Converter</h1>
          <p className="subtitle">Built with React, Node.js, and Python</p>

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

              {/* Cache Status Display */}
              <div
                style={{
                  marginBottom: "1rem",
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

              {sentences.length > 0 && (
                <div id="results-container">
                  <h2 className="results-title">Extracted Sentences</h2>
                  <div className="sentence-list">
                    {sentences.map((sentence, index) => (
                      <SentenceItem
                        key={index}
                        sentence={sentence}
                        index={index}
                        onPlay={() => handlePlay(index)}
                        onStop={handleStop}
                        isPlaying={
                          playbackState.status === "playing" &&
                          playbackState.currentIndex === index
                        }
                        isGeneratingAudio={generatingAudioIndex === index}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="right-column">
              <div className="pdf-preview-container">
                {pdfPreviewUrl ? (
                  <iframe
                    src={pdfPreviewUrl}
                    title="PDF Preview"
                    className="pdf-preview-iframe"
                  ></iframe>
                ) : (
                  <p style={{ color: "#a0aec0" }}>
                    PDF preview will appear here
                  </p>
                )}
              </div>
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
            speechSpeed={speechSpeed}
            onSpeedChange={handleSpeedChange}
          />
        )}
        <footer className="footer">
          <p>React Frontend | Node.js Backend | Python TTS Engine</p>
        </footer>
      </div>
    </div>
  );
}
