import React from "react";

/**
 * StyledButton - the single button primitive for the application.
 *
 * Every variant is a CSS class in app.css rather than an inline style object,
 * so buttons share one set of sizing, focus and disabled rules and cannot
 * drift apart. Hover is CSS, not React state, so a list of several hundred
 * buttons costs no subscriptions.
 *
 * Variants:
 * - "primary" / "secondary" / "help" - compact controls (PDF toolbar)
 * - "toolbar"  - labelled control for the app bar; supports `active`
 * - "upload"   - the prominent empty-state call to action
 * - "engine"   - segmented control; supports `active`
 * - "close"    - icon button on a coloured header
 * - "control" / "control-play-pause" / "control-stop" - the transport family
 */

export interface StyledButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  type?:
    | "primary"
    | "secondary"
    | "help"
    | "upload"
    | "toolbar"
    | "engine"
    | "close"
    | "control"
    | "control-play-pause"
    | "control-stop";
  title?: string;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  loading?: boolean;
  active?: boolean;
}

const VARIANT_CLASS: Record<string, string> = {
  primary: "btn--sm btn--primary",
  secondary: "btn--sm btn--secondary",
  help: "btn--sm btn--help",
  upload: "btn--upload",
  toolbar: "btn--md btn--toolbar",
  engine: "btn--engine",
  close: "btn--close",
  control: "btn--control",
  "control-play-pause": "btn--control btn--control-primary",
  "control-stop": "btn--control btn--control-stop",
};

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
  const className = [
    "btn",
    VARIANT_CLASS[type] ?? VARIANT_CLASS.primary,
    active ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {loading ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className="btn-spinner"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="16 16"
          />
        </svg>
      ) : (
        children
      )}
    </button>
  );
};

export default StyledButton;
