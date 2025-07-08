import React, { useState, useEffect, useReducer, useCallback } from "react";
import { PlaybackAction, useSpeechEvents } from "./hooks"; // Assuming hooks.ts is in the same directory
import * as api from "./api"; // Assuming api.ts is in the same directory
import "./App.css"; // Assuming App.css is in the same directory

// --- Type Definitions ---
interface ErrorMessageProps {
  message: string;
}

interface SentenceItemProps {
  sentence: string;
  index: number;
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
}

interface FloatingControlsProps {
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onStop: () => void; // Added prop for the new stop button
  isPlaying: boolean;
}

// --- Reducer for Playback State ---
type PlaybackState = {
  status: "idle" | "playing";
  currentIndex: number;
};

function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case "PLAY":
      return { ...state, status: "playing", currentIndex: action.payload };
    case "STOP":
      return { ...state, status: "idle" };
    case "SET_INDEX":
      return { ...state, currentIndex: action.payload };
    case "RESET":
      return { status: "idle", currentIndex: 0 };
    default:
      return state;
  }
}

// --- Helper Components ---

const LoadingSpinner: React.FC = () => (
  <div className="loading-overlay">
    <div style={{ textAlign: "center", color: "white" }}>
      <div className="spinner"></div>
      <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>Processing PDF...</p>
    </div>
  </div>
);

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => (
  <div className="error-message">
    <strong style={{ fontWeight: "bold" }}>Error: </strong>
    <span>{message}</span>
  </div>
);

const SentenceItem: React.FC<SentenceItemProps> = ({
  sentence,
  index,
  onPlay,
  onStop,
  isPlaying,
}) => (
  <div className={`sentence-item ${isPlaying ? "playing" : ""}`}>
    <p className="sentence-text">{sentence}</p>
    <button
      onClick={isPlaying ? onStop : onPlay}
      className={`play-button ${isPlaying ? "stop-button" : "start-button"}`}
      aria-label={
        isPlaying ? `Stop sentence ${index + 1}` : `Play sentence ${index + 1}`
      }
    >
      {isPlaying ? (
        <svg
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6v4H9z" />
        </svg>
      ) : (
        <svg
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )}
    </button>
  </div>
);

const FloatingControls: React.FC<FloatingControlsProps> = ({
  onPlayPause,
  onNext,
  onPrevious,
  onStop, // New prop
  isPlaying,
}) => (
  <div className="floating-controls">
    <button
      onClick={onPrevious}
      aria-label="Previous sentence"
      className="control-button"
    >
      <svg
        width="24"
        height="24"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
        />
      </svg>
    </button>
    <button
      onClick={onPlayPause}
      aria-label={isPlaying ? "Pause audio" : "Play audio"}
      className="control-button play-pause-button"
    >
      {isPlaying ? (
        <svg
          width="32"
          height="32"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ) : (
        <svg
          width="32"
          height="32"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )}
    </button>
    {/* New dedicated stop button */}
    <button
      onClick={onStop}
      aria-label="Stop all audio"
      className="control-button stop-all-button"
    >
      <svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
        <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z" />
      </svg>
    </button>
    <button
      onClick={onNext}
      aria-label="Next sentence"
      className="control-button"
    >
      <svg
        width="24"
        height="24"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 5l7 7-7 7M5 5l7 7-7 7"
        />
      </svg>
    </button>
  </div>
);

// --- Main App Component ---

export default function App() {
  const [sentences, setSentences] = useState<string[]>([]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [playbackState, dispatch] = useReducer(playbackReducer, {
    status: "idle",
    currentIndex: 0,
  });
  const { error, setError } = useSpeechEvents(dispatch);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsLoading(true);
      setError(null);
      dispatch({ type: "RESET" });
      setSentences([]);

      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
      setPdfPreviewUrl(URL.createObjectURL(file));

      try {
        const data = await api.uploadPdf(file);
        setSentences(data.sentences);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [pdfPreviewUrl, setError]
  );

  const handlePlay = useCallback(
    (index: number) => {
      if (sentences[index]) {
        dispatch({ type: "SET_INDEX", payload: index });
        api
          .speakSentence(sentences[index], index)
          .catch((err) => setError(err.message));
      }
    },
    [sentences, setError]
  );

  const handleStop = useCallback(() => {
    api.stopSpeech().catch((err) => setError(err.message));
  }, [setError]);

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
  }, [playbackState, sentences, handlePlay]);

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
          />
        )}
        <footer className="footer">
          <p>React Frontend | Node.js Backend | Python TTS Engine</p>
        </footer>
      </div>
    </div>
  );
}
