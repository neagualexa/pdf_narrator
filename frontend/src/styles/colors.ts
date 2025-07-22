/**
 * Color Theme - Aquamarine, Teal, and Dark Green Palette
 *
 * This file defines the consistent color scheme used throughout the PDF Narrator application.
 * Based on Tailwind CSS color palette with custom aquamarine additions.
 */

export const colors = {
  // Primary Teal Palette
  teal: {
    50: "#f0fdfa", // Very light teal background
    100: "#ccfbf1", // Light teal background
    200: "#99f6e4", // Light teal
    300: "#5eead4", // Medium light teal
    400: "#2dd4bf", // Medium teal
    500: "#14b8a6", // Main teal
    600: "#0891b2", // Primary teal (main brand color)
    700: "#0e7490", // Dark teal
    800: "#155e75", // Darker teal
    900: "#164e63", // Very dark teal
    950: "#083344", // Darkest teal
  },

  // Emerald/Green Palette
  emerald: {
    50: "#ecfdf5", // Very light green background
    100: "#d1fae5", // Light green background
    200: "#a7f3d0", // Light green
    300: "#6ee7b7", // Medium light green
    400: "#34d399", // Medium green
    500: "#10b981", // Main emerald (success color)
    600: "#059669", // Primary emerald
    700: "#047857", // Dark emerald
    800: "#065f46", // Darker emerald
    900: "#064e3b", // Very dark emerald
    950: "#022c22", // Darkest emerald
  },

  // Aquamarine (Custom blend of teal and cyan)
  aquamarine: {
    50: "#f0fdff", // Very light aquamarine
    100: "#ccfdf7", // Light aquamarine background
    200: "#99fbf2", // Light aquamarine
    300: "#5ef5ea", // Medium light aquamarine
    400: "#2de8d8", // Medium aquamarine
    500: "#14d4c4", // Main aquamarine
    600: "#0bb5a6", // Primary aquamarine
    700: "#0e9688", // Dark aquamarine
    800: "#15766a", // Darker aquamarine
    900: "#166157", // Very dark aquamarine
    950: "#083a35", // Darkest aquamarine
  },

  // Neutral grays (for disabled states, borders, etc.)
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Semantic colors
  semantic: {
    // Success states
    success: "#10b981", // emerald-500
    successHover: "#059669", // emerald-600
    successLight: "#d1fae5", // emerald-100

    // Warning/Loading states
    warning: "#14b8a6", // teal-500
    warningHover: "#0891b2", // teal-600
    warningLight: "#ccfbf1", // teal-100

    // Error/Stop states (using darker greens instead of reds)
    error: "#064e3b", // emerald-900
    errorHover: "#022c22", // emerald-950
    errorLight: "#ecfdf5", // emerald-50

    // Info states
    info: "#0891b2", // teal-600
    infoHover: "#0e7490", // teal-700
    infoLight: "#f0fdfa", // teal-50

    // Disabled states
    disabled: "#e5e7eb", // gray-200
    disabledText: "#9ca3af", // gray-400
  },

  // Button-specific color mappings
  button: {
    // Primary button (main actions)
    primary: "#0891b2", // teal-600
    primaryHover: "#0e7490", // teal-700
    primaryText: "#ffffff",

    // Secondary button (alternative actions)
    secondary: "#059669", // emerald-600
    secondaryHover: "#047857", // emerald-700
    secondaryText: "#ffffff",

    // Help/Info button
    help: "#f0fdfa", // teal-50
    helpBorder: "#5eead4", // teal-300
    helpText: "#0f766e", // teal-700

    // Play button (success action)
    play: "#10b981", // emerald-500
    playHover: "#059669", // emerald-600

    // Stop button (using teal instead of red)
    stop: "#14b8a6", // teal-500
    stopHover: "#0891b2", // teal-600

    // Loading state
    loading: "#a7f3d0", // emerald-200
    loadingAccent: "#6ee7b7", // emerald-300

    // Control buttons
    control: "#0f766e", // teal-700
    controlHover: "#ccfbf1", // teal-100
    controlActive: "#0891b2", // teal-600

    // Engine/Toggle buttons
    engine: "#6b7280", // gray-500
    engineHover: "#e5e7eb", // gray-200
    engineActive: "#0891b2", // teal-600
    engineActiveHover: "#0e7490", // teal-700

    // Voice toggle (gradient)
    voiceToggleFrom: "#14b8a6", // teal-500
    voiceToggleTo: "#059669", // emerald-600
  },
} as const;

// Export individual palettes for convenience
export const { teal, emerald, aquamarine, gray, semantic, button } = colors;

// Export common color combinations
export const gradients = {
  tealToEmerald: `linear-gradient(135deg, ${teal[500]} 0%, ${emerald[600]} 100%)`,
  aquamarineToTeal: `linear-gradient(135deg, ${aquamarine[500]} 0%, ${teal[600]} 100%)`,
  emeraldLight: `linear-gradient(135deg, ${emerald[200]} 0%, ${emerald[300]} 100%)`,
  tealDark: `linear-gradient(135deg, ${teal[600]} 0%, ${teal[700]} 100%)`,
} as const;

// Export shadow utilities
export const shadows = {
  teal: {
    sm: `0 2px 4px rgba(20, 184, 166, 0.3)`,
    md: `0 4px 8px rgba(20, 184, 166, 0.4)`,
    lg: `0 6px 12px rgba(20, 184, 166, 0.4)`,
  },
  emerald: {
    sm: `0 2px 4px rgba(16, 185, 129, 0.3)`,
    md: `0 4px 8px rgba(16, 185, 129, 0.4)`,
    lg: `0 6px 12px rgba(16, 185, 129, 0.4)`,
  },
  aquamarine: {
    sm: `0 2px 4px rgba(20, 212, 196, 0.3)`,
    md: `0 4px 8px rgba(20, 212, 196, 0.4)`,
    lg: `0 6px 12px rgba(20, 212, 196, 0.4)`,
  },
  general: {
    sm: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`,
    md: `0 4px 6px -1px rgba(0, 0, 0, 0.1)`,
    lg: `0 6px 25px rgba(0, 0, 0, 0.15)`,
  },
} as const;
