# Styles Directory

The styling system for PDF Narrator: a teal/emerald palette exposed as CSS custom
properties, plus a small set of component classes.

## File Structure

- **`app.css`** - the entire stylesheet: custom properties, layout, components
- **`colors.ts`** - the palette as TypeScript values
- **`cssTheme.ts`** - helpers for referencing the palette from TS
- **`index.ts`** - imports `app.css` and re-exports the TS helpers

`App.tsx` does `import "./styles"`, which is what pulls `app.css` into the bundle.

> **Note:** no component currently imports `colors.ts` or `cssTheme.ts` - every component
> styles itself with CSS classes and custom properties. They are kept for the palette's
> single source of truth, but if you are writing new UI, reach for the CSS variables below
> rather than inline style objects.

## Using the theme

Style components with classes and CSS custom properties:

```css
.my-component {
  background-color: var(--teal-50);
  color: var(--color-text-primary);
  border: 1px solid var(--teal-200);
}

.my-component:hover {
  background-color: var(--teal-100);
  box-shadow: var(--shadow-teal);
}
```

## Custom Properties

Defined on `:root` in `app.css`.

```css
/* Palettes */
--teal-50 ... --teal-950
--emerald-50 ... --emerald-950
--gray-50 ... --gray-900

/* Semantic */
--color-background, --color-card-bg
--color-text, --color-text-primary, --color-text-secondary, --color-text-muted
--color-border, --color-border-light, --color-border-focus
--color-button-primary, --color-button-primary-hover
--color-button-secondary, --color-button-secondary-hover
--color-success, --color-success-light
--color-warning, --color-warning-light
--color-error, --color-error-light

/* Z-index scale - the single source of stacking order */
--z-base, --z-sticky, --z-popover, --z-toast, --z-overlay

/* Shadows */
--shadow-sm, --shadow-md, --shadow-lg, --shadow-teal, --shadow-emerald

/* Gradients */
--gradient-teal-emerald, --gradient-teal-light
--gradient-emerald-light, --gradient-teal-dark
```

The **aquamarine** palette exists in `colors.ts` but is deliberately *not* emitted as CSS
variables - nothing uses it.

Always take a stacking order from the `--z-*` scale rather than inventing a number, so
overlays cannot fight.

## Buttons

Every button in the app is `StyledButton`, which renders `.btn` plus a variant class. Hover,
focus and disabled states are CSS - do not reimplement them per component.

```
.btn                    base: layout, focus ring, disabled state
.btn--sm  .btn--md      sizes
.btn--primary           solid teal
.btn--secondary         tinted
.btn--toolbar           labelled app-bar control; supports .is-active
.btn--upload            empty-state call to action
.btn--engine            segmented control; supports .is-active
.btn--close             icon button on a coloured header
.btn--control           transport: circular, 2rem
.btn--control-primary   transport: the emphasised play/pause, 2.5rem
.btn--control-stop      transport: stop
```

Add a variant by adding a class here and an entry in `StyledButton`'s `VARIANT_CLASS` map.

## Layout

`.app-shell` is a flex column - app bar, optional tab bar, then `.app-body`. It is flex
rather than fixed grid rows because the tab bar only exists on narrow viewports.

`.app-body` is a three-column grid: sentence pane, `.pane-divider`, document pane. The
columns are set **inline** from React state (the draggable split), so any rule that needs to
override the split must live behind the same breakpoint that stops React applying it.

- `.pane` - a scroll container; keep `min-height: 0` or its children will not scroll
- `.sentence-item` - `flex-shrink: 0` is load-bearing. It has `overflow: hidden` to clip its
  progress bar to the corner radius, and that zeroes a flex item's automatic minimum size,
  so without it every row collapses
- `--sentence-progress` - written on `.sentence-list` each animation frame; the active row's
  `::after` scales by it

## Responsive

One breakpoint at **1024px**, where the panes become tabs, and a second at **768px** that
trims the app bar and transport readouts. Both are at the bottom of `app.css`, alongside the
`prefers-reduced-motion` block that neutralises animation and smooth scrolling.

## Accessibility

- `.sr-only` - visually hidden, used by the now-playing live region
- Focus rings come from `.btn:focus-visible` and per-component `:focus-visible` rules; keep
  them, they are the only visible focus indicator

## Best Practices

1. **Prefer semantic variables** (`--color-text-primary`) over raw palette steps (`--teal-700`)
2. **Take z-index from the scale**, never a literal
3. **Style through classes in `app.css`**, not inline style objects
4. **Respect `prefers-reduced-motion`** for anything animated
5. **Check contrast** when introducing a new colour pairing
