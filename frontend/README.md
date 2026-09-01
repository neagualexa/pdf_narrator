# PDF Narrator - Frontend

The React frontend for [PDF Narrator](../README.md). Bootstrapped with
[Create React App](https://github.com/facebook/create-react-app), TypeScript template.

**Start here:** the root [README](../README.md) covers setup, running both halves together,
and what the app does. Styling conventions live in [`src/styles/README.md`](src/styles/README.md).

## Scripts

### `npm start`
Runs the dev server, preferring port 3000. Use `PORT` to choose another - `run.sh` does this
when 3000 is taken.

The frontend calls the backend directly at `http://localhost:3001`; override with
`REACT_APP_API_URL`. There is no CRA proxy - the backend enables CORS.

```bash
PORT=3002 REACT_APP_API_URL=http://localhost:4001 npm start
```

The backend must be running, or uploads and audio generation will fail.

### `npm test`
Jest in watch mode; `CI=true npm test` for a single run.

> **Known issue:** `App.test.tsx` fails to run - Jest cannot parse `react-pdf`'s ESM build
> without extra transform configuration. The other suites pass.

### `npm run build`
Production build into `build/`.

### `npm run eject`
One-way operation, removes the CRA build dependency. Not used by this project.

## Layout

```
src/
  App.tsx              app shell, playback orchestration, keyboard shortcuts
  api.ts               backend client
  types.ts             shared types
  voiceName.ts         voice display name -> spoken name
  pdfHighlight.ts      matches a spoken sentence to the PDF text layer
  components/          SentenceItem, TransportBar, VoiceControls, PdfViewer, StyledButton
  hooks/               useAudioManager, useAudioCache, useMediaQuery
  reducers/            appReducer, playbackReducer
  styles/              app.css and the theme (see its README)
```

## Learn More

- [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started)
- [React documentation](https://reactjs.org/)
