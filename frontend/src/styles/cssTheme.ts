/**
 * CSS Theme Generator - Utility to generate CSS custom properties from the color theme
 *
 * This utility helps synchronize the TypeScript color theme with CSS custom properties
 * for consistent theming across both styled components and CSS files.
 */

import { colors } from "./colors";

/**
 * Generates CSS custom properties string from the color theme
 * This can be used to dynamically inject theme colors into CSS
 */
export function generateCSSCustomProperties(): string {
  const cssProperties: string[] = [];

  // Generate teal palette
  Object.entries(colors.teal).forEach(([key, value]) => {
    cssProperties.push(`  --teal-${key}: ${value};`);
  });

  // Generate emerald palette
  Object.entries(colors.emerald).forEach(([key, value]) => {
    cssProperties.push(`  --emerald-${key}: ${value};`);
  });

  // Generate aquamarine palette
  Object.entries(colors.aquamarine).forEach(([key, value]) => {
    cssProperties.push(`  --aquamarine-${key}: ${value};`);
  });

  // Generate gray palette
  Object.entries(colors.gray).forEach(([key, value]) => {
    cssProperties.push(`  --gray-${key}: ${value};`);
  });

  // Generate semantic colors
  Object.entries(colors.semantic).forEach(([key, value]) => {
    cssProperties.push(
      `  --color-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${value};`
    );
  });

  // Generate button colors
  Object.entries(colors.button).forEach(([key, value]) => {
    cssProperties.push(
      `  --button-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${value};`
    );
  });

  return `:root {\n${cssProperties.join("\n")}\n}`;
}

/**
 * Utility to get CSS variable name for a color
 * @param colorPath - Path to the color (e.g., 'teal.500', 'semantic.primary')
 * @returns CSS variable name (e.g., 'var(--teal-500)')
 */
export function getCSSVariable(colorPath: string): string {
  const segments = colorPath.split(".");

  if (segments.length === 2) {
    const [palette, shade] = segments;

    // Handle semantic and button colors differently
    if (palette === "semantic" || palette === "button") {
      const variableName = shade.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `var(--${
        palette === "semantic" ? "color" : "button"
      }-${variableName})`;
    }

    // Handle color palettes
    return `var(--${palette}-${shade})`;
  }

  // Fallback for direct color names
  return `var(--${colorPath.replace(/([A-Z])/g, "-$1").toLowerCase()})`;
}

/**
 * Creates a theme object with CSS variables for easy use in styled components
 */
export const cssTheme = {
  colors: {
    // Primary colors
    primary: getCSSVariable("teal.600"),
    primaryHover: getCSSVariable("teal.700"),
    secondary: getCSSVariable("emerald.600"),
    secondaryHover: getCSSVariable("emerald.700"),

    // Text colors
    text: getCSSVariable("gray.700"),
    textPrimary: getCSSVariable("teal.700"),
    textSecondary: getCSSVariable("emerald.900"),
    textMuted: getCSSVariable("gray.500"),

    // Background colors
    background: "var(--color-background)",
    cardBg: "var(--color-card-bg)",

    // Border colors
    border: "var(--color-border)",
    borderLight: "var(--color-border-light)",
    borderFocus: "var(--color-border-focus)",

    // State colors
    success: getCSSVariable("emerald.500"),
    successLight: getCSSVariable("emerald.100"),
    warning: getCSSVariable("teal.500"),
    warningLight: getCSSVariable("teal.100"),
    error: getCSSVariable("emerald.900"),
    errorLight: getCSSVariable("emerald.50"),

    // Component specific
    uploadBg: getCSSVariable("teal.50"),
    uploadBorder: getCSSVariable("teal.200"),
    uploadBorderHover: getCSSVariable("teal.500"),
  },

  shadows: {
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    teal: "var(--shadow-teal)",
    emerald: "var(--shadow-emerald)",
  },

  gradients: {
    tealEmerald: "var(--gradient-teal-emerald)",
    tealLight: "var(--gradient-teal-light)",
    emeraldLight: "var(--gradient-emerald-light)",
    tealDark: "var(--gradient-teal-dark)",
  },
} as const;

export default cssTheme;
