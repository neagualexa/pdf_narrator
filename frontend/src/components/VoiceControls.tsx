import React, { useState, useEffect, useRef } from "react";
import { VoiceControlsProps } from "../types";

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  selectedVoiceId,
  onVoiceChange,
  speechSpeed,
  onSpeedChange,
  voices,
  isLoading,
  currentTtsEngine,
  onTtsEngineChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);
  const controlsRef = useRef<HTMLDivElement>(null);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Close the menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(event.target as Node) &&
        isExpanded
      ) {
        setIsExpanded(false);
      }
    };

    // Add event listener when expanded
    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    // Cleanup event listener
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded]);

  // Filter voices based on current TTS engine
  const filteredVoices = voices.filter(
    (voice) => voice.engine === currentTtsEngine
  );

  return (
    <div
      ref={controlsRef}
      className={`voice-controls-panel ${
        isExpanded ? "expanded" : "collapsed"
      }`}
    >
      {/* Collapsed state - small icon */}
      {!isExpanded && (
        <button
          className="voice-controls-toggle"
          onClick={toggleExpanded}
          aria-label="Open voice controls"
        >
          <svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
            <path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894zm-.493 3.905a21.682 21.682 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a9.68 9.68 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105z" />
          </svg>
        </button>
      )}

      {/* Expanded state - full panel */}
      {isExpanded && (
        <>
          <div className="voice-controls-header">
            <h3>Voice & Speed Controls</h3>
            <button
              className="voice-controls-close"
              onClick={toggleExpanded}
              aria-label="Close voice controls"
            >
              <svg
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" />
              </svg>
            </button>
          </div>

          <div className="voice-controls-content">
            {/* TTS Engine Selection */}
            <div className="engine-selection">
              <label className="engine-label">
                <svg
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
                  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
                </svg>
                TTS Engine
              </label>
              <div className="engine-toggle">
                <button
                  className={`engine-button ${
                    currentTtsEngine === "pyttsx3" ? "active" : ""
                  }`}
                  onClick={() => onTtsEngineChange("pyttsx3")}
                >
                  System Voice
                </button>
                <button
                  className={`engine-button ${
                    currentTtsEngine === "piper" ? "active" : ""
                  }`}
                  onClick={() => onTtsEngineChange("piper")}
                >
                  Piper Neural
                </button>
              </div>
            </div>

            {/* Voice Selection */}
            <div className="voice-selection">
              <label htmlFor="voice-select" className="voice-label">
                <svg
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894zm-.493 3.905a21.682 21.682 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a9.68 9.68 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105z" />
                </svg>
                Voice ({currentTtsEngine === "piper" ? "Neural" : "System"})
              </label>

              {isLoading ? (
                <div className="voice-loading">
                  <span>Loading voices...</span>
                </div>
              ) : (
                <select
                  id="voice-select"
                  value={selectedVoiceId || ""}
                  onChange={(e) => onVoiceChange(e.target.value)}
                  className="voice-dropdown"
                  disabled={filteredVoices.length === 0}
                >
                  <option value="">Select a voice...</option>
                  {filteredVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}{" "}
                      {voice.gender !== "unknown" && `(${voice.gender})`}
                    </option>
                  ))}
                </select>
              )}

              {selectedVoice && (
                <div className="voice-info">
                  <span className="voice-details">
                    <span className="voice-engine">
                      {selectedVoice.engine === "piper" ? "Piper" : "System"} •{" "}
                      {selectedVoice.type} •{" "}
                    </span>
                    {selectedVoice.languages.length > 0 && (
                      <span className="voice-language">
                        {selectedVoice.languages.join(", ")}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Speed Control */}
            <div className="speed-control">
              <label htmlFor="speed-slider" className="speed-label">
                Speed: {Math.round(speechSpeed)}%
              </label>
              <div className="speed-controls">
                <button
                  onClick={() => onSpeedChange(Math.max(50, speechSpeed - 10))}
                  className="speed-button"
                  aria-label="Decrease speed by 10%"
                  disabled={speechSpeed <= 50}
                >
                  <svg
                    width="14"
                    height="14"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
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
                  <svg
                    width="14"
                    height="14"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
