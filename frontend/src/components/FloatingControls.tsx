import React from "react";
import { FloatingControlsProps } from "../types";

export const FloatingControls: React.FC<FloatingControlsProps> = ({
  onPlayPause,
  onNext,
  onPrevious,
  onStop,
  isPlaying,
  speechSpeed,
  onSpeedChange,
}) => (
  <div className="floating-controls">
    {/* Speed Control */}
    <div className="speed-control">
      <label htmlFor="speed-slider" className="speed-label">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 3a.5.5 0 0 1 .5.5v3.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7.5 7.293V3.5A.5.5 0 0 1 8 3z" />
          <path d="M3.5 9.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-1z" />
        </svg>
        {Math.round(speechSpeed)}%
      </label>
      <div className="speed-controls">
        <button
          onClick={() => onSpeedChange(Math.max(50, speechSpeed - 10))}
          className="speed-button"
          aria-label="Decrease speed by 10%"
          disabled={speechSpeed <= 50}
        >
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z" />
          </svg>
        </button>
        <input
          id="speed-slider"
          type="range"
          min="50"
          max="300"
          step="10"
          value={speechSpeed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="speed-slider"
          aria-label="Speech speed"
        />
        <button
          onClick={() => onSpeedChange(Math.min(300, speechSpeed + 10))}
          className="speed-button"
          aria-label="Increase speed by 10%"
          disabled={speechSpeed >= 300}
        >
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" />
          </svg>
        </button>
      </div>
    </div>
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
    {/* Force stop/reset button */}
    <button
      onClick={onStop}
      aria-label="Force stop all audio and reset"
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
