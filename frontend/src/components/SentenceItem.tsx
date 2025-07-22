import React from "react";
import { SentenceItemProps } from "../types";
import StyledButton from "./StyledButton";

export const SentenceItem: React.FC<SentenceItemProps> = ({
  sentence,
  index,
  onPlay,
  onStop,
  isPlaying,
  isLastPlayed,
  isGeneratingAudio,
}) => {
  const getButtonType = () => {
    if (isGeneratingAudio) return "play-loading";
    if (isPlaying) return "play-stop";
    return "play-start";
  };

  return (
    <div
      className={`sentence-item ${
        isPlaying ? "playing" : isLastPlayed ? "last-played" : ""
      } ${isGeneratingAudio ? "generating" : ""}`}
      data-sentence-index={index}
    >
      <p className="sentence-text">{sentence}</p>
      <StyledButton
        type={getButtonType()}
        onClick={isPlaying ? onStop : onPlay}
        disabled={isGeneratingAudio}
        loading={isGeneratingAudio}
        title={
          isGeneratingAudio
            ? `Generating audio for sentence ${index + 1}...`
            : isPlaying
            ? `Stop sentence ${index + 1}`
            : `Play sentence ${index + 1}`
        }
      >
        {!isGeneratingAudio && (
          <>
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 10h6v4H9z"
                />
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
          </>
        )}
      </StyledButton>
    </div>
  );
};
