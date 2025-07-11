import React from "react";
import { SentenceItemProps } from "../types";

export const SentenceItem: React.FC<SentenceItemProps> = ({
  sentence,
  index,
  onPlay,
  onStop,
  isPlaying,
  isGeneratingAudio,
}) => (
  <div
    className={`sentence-item ${isPlaying ? "playing" : ""} ${
      isGeneratingAudio ? "generating" : ""
    }`}
  >
    <p className="sentence-text">{sentence}</p>
    <button
      onClick={isPlaying ? onStop : onPlay}
      className={`play-button ${isPlaying ? "stop-button" : "start-button"} ${
        isGeneratingAudio ? "loading" : ""
      }`}
      aria-label={
        isGeneratingAudio
          ? `Generating audio for sentence ${index + 1}...`
          : isPlaying
          ? `Stop sentence ${index + 1}`
          : `Play sentence ${index + 1}`
      }
      disabled={isGeneratingAudio}
    >
      {isGeneratingAudio ? (
        <div className="button-spinner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="32"
              strokeDashoffset="32"
              style={{
                animation: "spin 1s linear infinite",
                transformOrigin: "center",
              }}
            />
          </svg>
        </div>
      ) : isPlaying ? (
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
