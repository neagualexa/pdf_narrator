import React from "react";
import { TransportBarProps } from "../types";
import StyledButton from "./StyledButton";

export const TransportBar: React.FC<TransportBarProps> = ({
  onPlayPause,
  onNext,
  onPrevious,
  onStop,
  isPlaying,
  cachedCount,
  currentIndex,
  totalSentences,
}) => (
  <div className="transport-bar">
    <div
      className="transport-progress"
      role="progressbar"
      aria-label="Playback position"
      aria-valuemin={1}
      aria-valuemax={totalSentences}
      aria-valuenow={currentIndex + 1}
    >
      <div
        className="transport-progress-fill"
        style={{
          width: `${
            totalSentences > 0 ? ((currentIndex + 1) / totalSentences) * 100 : 0
          }%`,
        }}
      />
    </div>
    <StyledButton type="control" onClick={onPrevious} title="Previous sentence">
      <svg
        width="17"
        height="17"
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
    </StyledButton>
    <StyledButton
      type="control-play-pause"
      onClick={onPlayPause}
      title={isPlaying ? "Pause audio" : "Play audio"}
    >
      {isPlaying ? (
        <svg
          width="22"
          height="22"
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
          width="22"
          height="22"
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
    </StyledButton>
    <StyledButton
      type="control-stop"
      onClick={onStop}
      title="Force stop all audio and reset"
    >
      <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16">
        <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z" />
      </svg>
    </StyledButton>
    <StyledButton type="control" onClick={onNext} title="Next sentence">
      <svg
        width="17"
        height="17"
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
    </StyledButton>

    <div className="transport-position">
      {currentIndex + 1} of {totalSentences}
    </div>

    <div className="transport-status" title="Sentences with audio ready to play">
      <span className={`buffer-dot ${cachedCount > 0 ? "buffered" : ""}`} />
      {cachedCount > 0 ? `${cachedCount} buffered` : "Nothing buffered"}
    </div>
  </div>
);
