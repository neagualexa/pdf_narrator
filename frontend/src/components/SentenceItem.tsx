import React from "react";
import { SentenceItemProps } from "../types";

const PlayIcon = () => (
  <svg
    width="18"
    height="18"
    fill="currentColor"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z" />
  </svg>
);

const StopIcon = () => (
  <svg
    width="18"
    height="18"
    fill="currentColor"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <path d="M5 5.5A.5.5 0 0 1 5.5 5h5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-5z" />
  </svg>
);

const SpinnerIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    className="sentence-spinner"
    aria-hidden="true"
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="14 14"
    />
  </svg>
);

/**
 * A single transcript row. The row itself is the button - there is no nested
 * interactive element - so a click anywhere on the sentence toggles it and
 * Enter/Space work natively for keyboard users.
 */
export const SentenceItem: React.FC<SentenceItemProps> = ({
  sentence,
  index,
  onPlay,
  onStop,
  isPlaying,
  isLastPlayed,
  isGeneratingAudio,
}) => {
  const state = isGeneratingAudio
    ? "generating"
    : isPlaying
    ? "playing"
    : isLastPlayed
    ? "last-played"
    : "";

  const handleClick = () => {
    // Stay focusable while audio is generating (a disabled button would drop
    // focus mid-list), but ignore the click until it is ready.
    if (isGeneratingAudio) return;
    if (isPlaying) {
      onStop();
    } else {
      onPlay();
    }
  };

  const label = isGeneratingAudio
    ? `Generating audio for sentence ${index + 1}`
    : isPlaying
    ? `Stop sentence ${index + 1}`
    : `Play sentence ${index + 1}`;

  return (
    <button
      type="button"
      className={`sentence-item ${state}`}
      data-sentence-index={index}
      onClick={handleClick}
      aria-label={label}
      aria-current={isPlaying ? "true" : undefined}
      aria-busy={isGeneratingAudio || undefined}
    >
      <span className="sentence-index" aria-hidden="true">
        {index + 1}
      </span>
      <span className="sentence-text">{sentence}</span>
      <span className="sentence-action" aria-hidden="true">
        {isGeneratingAudio ? (
          <SpinnerIcon />
        ) : isPlaying ? (
          <StopIcon />
        ) : (
          <PlayIcon />
        )}
      </span>
    </button>
  );
};
