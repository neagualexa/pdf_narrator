# Styles Directory

This directory contains the centralized theming system for the PDF Narrator application, using a consistent Aquamarine, Teal, and Dark Green color palette.

## File Structure

- **`colors.ts`** - Main color theme definition with TypeScript types
- **`app.css`** - Main CSS file with CSS custom properties (CSS variables)
- **`cssTheme.ts`** - Utilities for generating CSS custom properties from the theme
- **`index.ts`** - Central export for all styling utilities

## Usage

### 1. Using Colors in TypeScript/React Components

```typescript
import { colors, teal, emerald } from './styles/colors';

// Direct color access
const buttonColor = colors.teal[600]; // "#0891b2"
const hoverColor = colors.teal[700];  // "#0e7490"

// Using semantic colors
const primaryColor = colors.button.primary;
const successColor = colors.semantic.success;

// Using palette shortcuts
const lightTeal = teal[100];
const darkEmerald = emerald[800];
```

### 2. Using CSS Variables in CSS Files

```css
/* Use predefined CSS custom properties */
.my-component {
  background-color: var(--teal-600);
  color: var(--color-text-primary);
  border: 1px solid var(--teal-200);
}

.my-component:hover {
  background-color: var(--teal-700);
  box-shadow: var(--shadow-teal);
}

/* Use semantic colors */
.success-message {
  background-color: var(--color-success-light);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}
```

### 3. Using the CSS Theme Utility

```typescript
import { cssTheme, getCSSVariable } from './styles/cssTheme';

// Get CSS variable references
const primaryColor = cssTheme.colors.primary; // "var(--teal-600)"
const tealVar = getCSSVariable('teal.500');   // "var(--teal-500)"

// Use in styled-components or inline styles
const StyledDiv = styled.div`
  background: ${cssTheme.colors.primary};
  box-shadow: ${cssTheme.shadows.teal};
  background-image: ${cssTheme.gradients.tealEmerald};
`;
```

## Color Palette

### Teal (Primary Brand Color)
- `teal-50` to `teal-950` - Light to dark teal shades
- Main brand color: `teal-600` (#0891b2)

### Emerald (Success/Action Color)
- `emerald-50` to `emerald-950` - Light to dark emerald shades
- Success color: `emerald-500` (#10b981)

### Aquamarine (Accent Color)
- `aquamarine-50` to `aquamarine-950` - Light to dark aquamarine shades
- Special highlights: `aquamarine-500` (#14d4c4)

### Gray (Neutral Colors)
- `gray-50` to `gray-900` - Standard gray palette for text and borders

## Semantic Color Names

The theme includes semantic color mappings for common use cases:

- **Primary Actions**: `colors.button.primary` (teal-600)
- **Secondary Actions**: `colors.button.secondary` (emerald-600)
- **Success States**: `colors.semantic.success` (emerald-500)
- **Warning States**: `colors.semantic.warning` (teal-500)
- **Error States**: `colors.semantic.error` (emerald-900)
- **Text Colors**: `colors.semantic.text` (gray-700)

## CSS Custom Properties Available

The following CSS variables are automatically generated and available:

```css
/* Color Palettes */
--teal-50, --teal-100, ..., --teal-950
--emerald-50, --emerald-100, ..., --emerald-950
--aquamarine-50, --aquamarine-100, ..., --aquamarine-950
--gray-50, --gray-100, ..., --gray-900

/* Semantic Colors */
--color-primary, --color-secondary
--color-success, --color-warning, --color-error
--color-text, --color-text-primary, --color-text-secondary

/* Component Colors */
--color-background, --color-card-bg
--color-border, --color-border-light, --color-border-focus

/* Shadows */
--shadow-sm, --shadow-md, --shadow-lg
--shadow-teal, --shadow-emerald

/* Gradients */
--gradient-teal-emerald
--gradient-teal-light, --gradient-emerald-light
--gradient-teal-dark
```

## Migration from Old App.css

The new system is backward compatible. The old `App.css` styles are preserved but now use CSS custom properties for colors instead of hardcoded hex values. This provides:

1. **Consistency** - All colors come from the central theme
2. **Maintainability** - Change colors in one place
3. **Type Safety** - TypeScript support for color values
4. **Flexibility** - Easy to create theme variants or dark mode

## Best Practices

1. **Use semantic colors** when possible (`--color-primary` instead of `--teal-600`)
2. **Use CSS variables** in CSS files for better performance
3. **Use TypeScript colors** in React components for type safety
4. **Document color usage** when creating new components
5. **Test color contrast** for accessibility compliance
