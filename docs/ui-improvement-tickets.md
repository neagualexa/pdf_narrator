# Dashboard UI — Improvement Tickets

Starter set of 5 tickets from a review of `frontend/src/App.tsx`, the control
components, `frontend/src/styles/app.css`, and `misc/PDF_narrator_screenshot.png`.

**Current shell.** One white card centered at `max-width: 80rem`, split 50/50 into a
left column (upload box + sentence list, `max-height: 60vh`) and a right column
(PDF at `height: 80vh` + a debug cache box). Two independent `position: fixed`
panels float over that — voice controls bottom-left (`z-index: 1000`), transport
bottom-right (`z-index: 40`). Both overlap real content in the committed screenshot.

**Suggested sequencing.** UI-1 and UI-2 are the same refactor and should land
together — they unblock the rest. UI-3 is the highest-value single change for how
the app feels. UI-4 is the biggest lift (needs backend page metadata). UI-5 is a
cleanup sweep that can happen anytime.

---

## UI-1 — Rebuild the shell as a full-height app layout instead of a centered card

**Problem.**
`.app-wrapper` centers a `.card` with `align-items: center` and 2rem padding, so on
a wide screen the reading surface is boxed in with dead margin, while the two
columns disagree on height (`.sentence-list` 60vh vs `.pdf-preview-container` 80vh),
leaving a ~20vh gap under the sentence list. The whole page also scrolls *and* the
sentence list scrolls — two scroll contexts stacked.

**Proposal.**
- Move to `height: 100dvh; display: grid; grid-template-rows: auto 1fr` — a slim app
  bar (title + file name + upload) over a two-pane body that fills the viewport.
- Each pane owns its own `overflow-y: auto`; the page itself never scrolls.
- Kill `.card`'s shadow/radius framing, or reduce it to a subtle divider between panes.

**Also in scope.**
- The upload box (`App.tsx` ~line 560) keeps its full dashed-border hero treatment
  forever, even with a document loaded. Collapse it to a small "Replace PDF" button
  in the app bar once `sentences.length > 0`.
- Drop the `Cache Status: N sentences cached` box (`App.tsx` ~line 640) — inline-styled
  with hardcoded `#ccc`/`#666` that bypass the theme tokens. It is a debug readout in
  production chrome; fold it into a small buffering indicator on the transport bar.

**Done when.**
- No page-level scrollbar at 1280×800.
- Both panes are equal height; no dead space below the sentence list.
- The cache div and its inline styles are gone.

---

## UI-2 — Dock the floating panels; stop them covering content

**Problem.**
In the committed screenshot the voice panel sits on top of sentences 2–5, and the
transport bar overlaps the PDF page-navigation toolbar. Neither panel reserves
layout space, and their z-indexes (1000 vs 40) mean they can also overlap each other
on a short window. Discoverability is bad too: everything a user tunes — engine,
voice, speed — is behind an unlabeled speech-bubble icon in a screen corner.

**Proposal.**
- Transport (`components/FloatingControls.tsx`) becomes a persistent bottom bar
  spanning the sentence pane only, in flow — not fixed over the PDF. It is the
  primary control; it should not hide.
- Voice/engine/speed (`components/VoiceControls.tsx`) moves out of the bottom-left
  bubble into a settings popover anchored to a labeled gear in the app bar, or a
  right-side slide-over. Keep the click-outside-to-close logic already in
  `VoiceControls.tsx:24-42`.
- Introduce a single `--z-*` scale in `app.css` so overlays cannot fight.

**Done when.**
- No control ever occludes a sentence or the PDF toolbar at 1280×800 or 1440×900.
- The settings entry point has a visible text label.

---

## UI-3 — Make the sentence list read like a transcript, not a list of buttons

**Problem.**
Every row carries its own 48px circular play button (`components/SentenceItem.tsx`) —
in a 400-sentence document that is 400 green circles, the loudest thing on screen,
competing with the text the user is supposed to read. The text itself is
`--color-text-primary` (teal `#0e7490`) at default size with no measure constraint,
a poor choice for sustained reading. There is no sentence number, no position
indicator, no visual grouping by paragraph or page.

**Proposal.**
- Row = index gutter + sentence text. The play button appears on hover/focus only;
  the whole row stays clickable — make it a real `<button>`, or add `role="button"`
  plus Enter/Space handling.
- Sentence text in neutral `--gray-800`, ~1.0625rem, `line-height: 1.65`,
  `max-width: 68ch`. Reserve teal for the *active* state only.
- Distinguish the three states properly. `.playing` (teal gradient) and
  `.last-played` (emerald gradient) are near-identical to the eye — swap
  `.last-played` for a low-key left rule or dimmed text, and give `.playing` a single
  unambiguous accent bar.
- `.sentence-item.playing` uses `transform: translateY(-2px)` plus a 3s infinite
  `border-glow` animation. Combined with the 100ms-delayed `scrollIntoView` in
  `App.tsx:88-104`, the active row shifts under a moving scroll target. Drop the
  transform and the infinite animation; wrap what remains in
  `@media (prefers-reduced-motion: reduce)`.
- Add a progress bar / "42 of 380" readout to the transport bar.

**Done when.**
- A 300-sentence document scans as a document.
- The active sentence is unmistakable without animation.
- The list is keyboard-navigable.

---

## UI-4 — Link the PDF pane to playback

**Problem.**
The two panes are unaware of each other. Play sentence 90 and the PDF is still on
page 1 — the preview is decorative. `components/PdfViewer.tsx` also renders one page
at a time at a hardcoded `baseWidth` of 600px (`PdfViewer.tsx:30-33`, computed once
on load, never on resize) with `zoomOut` floored at `scale: 1.0`, so on a narrow pane
the page cannot be fitted and on a wide one the space is wasted.

**Proposal.**
- Carry a page number through from extraction so each sentence knows its source page;
  auto-advance the PDF as playback crosses a page boundary, with a "follow playback"
  toggle so manual browsing is not hijacked. If the backend does not emit page numbers
  yet, that is the first task in this ticket — check `backend/src` extraction.
- Stretch goal, same ticket if cheap: highlight the active sentence in the PDF text
  layer (`react-pdf` already ships `TextLayer.css`, which the viewer imports).
- Fix sizing: recompute width on container resize (`ResizeObserver`), allow `scale`
  down to 0.5, and add a fit-to-width default.

**Done when.**
- Continuous playback keeps the visible PDF page in sync.
- Resizing the window reflows the page.
- Zoom range is 0.5–3.0.

---

## UI-5 — Responsive, accessible, and persistent config

**Problem.** Three gaps that all live in the control layer:

- `app.css` has **zero** media queries. `.main-content` is
  `grid-template-columns: 1fr 1fr` unconditionally, so under ~900px the PDF and the
  sentence list are both unusable.
- The global key handler in `App.tsx` (~lines 452-480) binds Space/←/→ on `document`
  with no check on `event.target`. Focus the voice `<select>` and press Space and it
  fires play/pause instead of opening the dropdown. Icon-only buttons pass `title`
  but no `aria-label`; there is no `aria-live` region announcing the current sentence
  or generation state.
- Voice, engine, and speed reset to defaults on every reload — and the speed slider
  is labeled `%` in `VoiceControls.tsx` while the README documents it as
  "50–300 WPM". One of the two is wrong.

**Proposal.**
- Breakpoint at ~1024px that stacks the panes into tabs (Sentences / Document).
- Guard the key handler against `input`/`select`/`textarea`/`contenteditable` targets.
- `aria-label` on every icon button; `aria-live="polite"` on the now-playing status.
- Persist `{engine, voiceId, speed}` to `localStorage`.
- Settle the %-vs-WPM question and make the label match the backend's actual unit.

**Done when.**
- Usable at 768px wide.
- Space in the voice dropdown opens the dropdown.
- Settings survive a reload.
- A screen reader announces sentence changes.
