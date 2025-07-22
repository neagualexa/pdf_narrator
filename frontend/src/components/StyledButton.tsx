import React, { useState } from "react";
import { colors, gradients, shadows } from "../styles/colors";

/**
 * StyledButton - A unified button component that supports all button styles used throughout the application
 *
 * Color Scheme: Aquamarine, Teal, and Dark Green theme
 * - Primary colors: Teal (main brand color)
 * - Secondary colors: Emerald/Green (success states)
 * - Accent colors: Aquamarine (special highlights)
 *
 * Types available:
 * - "primary", "secondary", "help" - General purpose buttons for UI actions
 * - "upload" - Large, prominent button for file uploads
 * - "play-start", "play-stop", "play-loading" - Circular play buttons for sentence items
 * - "control", "control-play-pause", "control-stop" - Floating control buttons
 * - "engine", "engine-active" - Toggle buttons for engine selection
 * - "voice-toggle" - Voice controls toggle button
 *
 * Usage examples:
 * <StyledButton type="upload" onClick={onUpload}>Select PDF to Upload</StyledButton>
 * <StyledButton type="play-start" onClick={onPlay}>▶</StyledButton>
 * <StyledButton type="control-stop" onClick={onStop}>⬛</StyledButton>
 * <StyledButton type="engine" active={isActive} onClick={onChange}>Engine</StyledButton>
 */

export interface StyledButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  type?:
    | "primary"
    | "secondary"
    | "help"
    | "upload"
    | "play-start"
    | "play-stop"
    | "play-loading"
    | "control"
    | "control-play-pause"
    | "control-stop"
    | "engine"
    | "engine-active"
    | "voice-toggle";
  title?: string;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  loading?: boolean;
  active?: boolean;
}

const StyledButton: React.FC<StyledButtonProps> = ({
  onClick,
  disabled = false,
  type = "primary",
  title,
  children,
  onMouseEnter,
  onMouseLeave,
  loading = false,
  active = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Button style definitions
  const buttonStyles = {
    // Base styles
    base: {
      padding: "4px 8px",
      border: "none",
      borderRadius: "3px",
      fontSize: "12px",
      fontWeight: "500" as const,
      transition: "all 0.2s ease",
      outline: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },

    // Original inline styles for PDF viewer
    primary: {
      backgroundColor: colors.button.primary,
      color: colors.button.primaryText,
      cursor: "pointer",
    },
    primaryHover: {
      backgroundColor: colors.button.primaryHover,
    },
    secondary: {
      backgroundColor: colors.button.secondary,
      color: colors.button.secondaryText,
      cursor: "pointer",
    },
    secondaryHover: {
      backgroundColor: colors.button.secondaryHover,
    },
    help: {
      backgroundColor: colors.button.help,
      color: colors.button.helpText,
      cursor: "help",
      border: `1px solid ${colors.button.helpBorder}`,
      padding: "6px",
      fontSize: "14px",
      fontWeight: "normal" as const,
    },

    // Upload button styles (large, prominent)
    upload: {
      backgroundColor: colors.teal[700], // Using teal-700 to match upload text
      color: colors.button.primaryText,
      cursor: "pointer",
      padding: "0.75rem 2rem",
      borderRadius: "9999px",
      fontSize: "16px",
      fontWeight: "600" as const,
      boxShadow: shadows.teal.sm,
    },
    uploadHover: {
      backgroundColor: colors.teal[800], // Darker hover state (teal-800)
      transform: "scale(1.05)",
      boxShadow: shadows.teal.md,
    },

    // Play button styles (circular, for sentence items)
    playBase: {
      color: "white",
      padding: "0.75rem",
      borderRadius: "9999px",
      border: "none",
      transition: "all 0.3s ease",
      cursor: "pointer",
      fontSize: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    playStart: {
      backgroundColor: colors.button.play,
      boxShadow: shadows.emerald.sm,
    },
    playStartHover: {
      backgroundColor: colors.button.playHover,
      transform: "scale(1.1)",
      boxShadow: shadows.emerald.md,
    },
    playStop: {
      backgroundColor: colors.button.stop,
      background: gradients.tealToEmerald,
      boxShadow: shadows.teal.sm,
      animation: "pulse-glow 2s ease-in-out infinite alternate",
    },
    playStopHover: {
      backgroundColor: colors.button.stopHover,
      background: gradients.tealDark,
      transform: "scale(1.1)",
      boxShadow: shadows.teal.lg,
    },
    playLoading: {
      backgroundColor: colors.button.loading,
      background: gradients.emeraldLight,
      cursor: "not-allowed",
      boxShadow: `0 2px 4px rgba(167, 243, 208, 0.3)`,
      opacity: 0.7,
      pointerEvents: "none" as const,
    },

    // Control button styles (floating controls)
    controlBase: {
      background: "none",
      border: "none",
      color: colors.button.control,
      padding: "0.75rem",
      borderRadius: "50%",
      cursor: "pointer",
      transition: "background-color 0.2s, color 0.2s",
    },
    controlHover: {
      backgroundColor: colors.button.controlHover,
    },
    controlPlayPause: {
      color: colors.button.controlActive,
    },
    controlPlayPauseHover: {
      color: colors.button.primaryHover,
    },
    controlStop: {
      color: colors.semantic.error,
      backgroundColor: colors.semantic.errorLight,
      border: `1px solid ${colors.semantic.error}`,
    },
    controlStopHover: {
      color: colors.semantic.errorHover,
      backgroundColor: `rgba(6, 78, 59, 0.2)`,
      borderColor: `rgba(6, 78, 59, 0.4)`,
      transform: "scale(1.05)",
    },

    // Speed button styles (small square buttons)
    speedButton: {
      background: colors.gray[50],
      border: `1px solid ${colors.gray[200]}`,
      color: colors.gray[600],
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "all 0.2s",
      fontSize: "12px",
    },
    speedButtonHover: {
      background: colors.gray[100],
      borderColor: colors.gray[300],
      color: colors.gray[700],
    },

    // Engine button styles (toggle buttons)
    engineButton: {
      flex: 1,
      padding: "0.5rem 1rem",
      border: "none",
      borderRadius: "0.375rem",
      backgroundColor: "transparent",
      color: colors.button.engine,
      fontSize: "0.875rem",
      fontWeight: "500",
      transition: "all 0.2s ease",
      cursor: "pointer",
    },
    engineButtonHover: {
      backgroundColor: colors.button.engineHover,
      color: colors.gray[700],
    },
    engineButtonActive: {
      backgroundColor: colors.button.engineActive,
      color: "white",
      boxShadow: shadows.general.sm,
    },
    engineButtonActiveHover: {
      backgroundColor: colors.button.engineActiveHover,
    },

    // Voice controls toggle button
    voiceToggle: {
      width: "100%",
      height: "100%",
      border: "none",
      background: `linear-gradient(135deg, ${colors.button.voiceToggleFrom} 0%, ${colors.button.voiceToggleTo} 100%)`,
      color: "white",
      borderRadius: "12px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
    },
    voiceToggleHover: {
      transform: "scale(1.05)",
      boxShadow: shadows.general.lg,
    },

    // Disabled state
    disabled: {
      backgroundColor: colors.semantic.disabled,
      color: colors.semantic.disabledText,
      cursor: "not-allowed",
    },
  };

  const getButtonStyle = (
    buttonType: StyledButtonProps["type"],
    isDisabled = false,
    isActive = false,
    isLoading = false
  ) => {
    if (isDisabled) {
      return { ...buttonStyles.base, ...buttonStyles.disabled };
    }

    switch (buttonType) {
      case "primary":
        return { ...buttonStyles.base, ...buttonStyles.primary };
      case "secondary":
        return { ...buttonStyles.base, ...buttonStyles.secondary };
      case "help":
        return { ...buttonStyles.base, ...buttonStyles.help };
      case "upload":
        return { ...buttonStyles.base, ...buttonStyles.upload };

      case "play-start":
        return { ...buttonStyles.playBase, ...buttonStyles.playStart };
      case "play-stop":
        return { ...buttonStyles.playBase, ...buttonStyles.playStop };
      case "play-loading":
        return { ...buttonStyles.playBase, ...buttonStyles.playLoading };

      case "control":
        return { ...buttonStyles.controlBase };
      case "control-play-pause":
        return {
          ...buttonStyles.controlBase,
          ...buttonStyles.controlPlayPause,
        };
      case "control-stop":
        return { ...buttonStyles.controlBase, ...buttonStyles.controlStop };

      case "engine":
        return { ...buttonStyles.engineButton };
      case "engine-active":
        return {
          ...buttonStyles.engineButton,
          ...buttonStyles.engineButtonActive,
        };

      case "voice-toggle":
        return { ...buttonStyles.voiceToggle };

      default:
        return { ...buttonStyles.base, ...buttonStyles.primary };
    }
  };

  const getHoverStyle = () => {
    if (disabled || loading) return {};

    switch (type) {
      case "primary":
        return isHovered ? buttonStyles.primaryHover : {};
      case "secondary":
        return isHovered ? buttonStyles.secondaryHover : {};
      case "upload":
        return isHovered ? buttonStyles.uploadHover : {};

      case "play-start":
        return isHovered ? buttonStyles.playStartHover : {};
      case "play-stop":
        return isHovered ? buttonStyles.playStopHover : {};

      case "control":
        return isHovered ? buttonStyles.controlHover : {};
      case "control-play-pause":
        return isHovered
          ? {
              ...buttonStyles.controlHover,
              ...buttonStyles.controlPlayPauseHover,
            }
          : {};
      case "control-stop":
        return isHovered ? buttonStyles.controlStopHover : {};

      case "engine":
        return isHovered ? buttonStyles.engineButtonHover : {};
      case "engine-active":
        return isHovered ? buttonStyles.engineButtonActiveHover : {};

      case "voice-toggle":
        return isHovered ? buttonStyles.voiceToggleHover : {};

      default:
        return {};
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onMouseLeave?.();
      }}
      style={{
        ...getButtonStyle(type, disabled, active, loading),
        ...getHoverStyle(),
      }}
    >
      {loading && type?.includes("play") ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              animation: "spin 1s linear infinite",
            }}
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="16 16"
              style={{
                animation: "spin 1s linear infinite",
              }}
            />
          </svg>
        </div>
      ) : (
        children
      )}
    </button>
  );
};

export default StyledButton;
