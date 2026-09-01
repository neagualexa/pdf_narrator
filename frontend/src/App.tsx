import React, {
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { appReducer, initialAppState } from "./reducers/appReducer";
import {
  playbackReducer,
  initialPlaybackState,
} from "./reducers/playbackReducer";
import { useAudioManager } from "./hooks/useAudioManager";
import { useAudioCache, LOOKAHEAD } from "./hooks/useAudioCache";
import { AudioCacheEntry, PlaybackAction } from "./types";
import { LoadingSpinner, ErrorMessage } from "./components/LoadingSpinner";
import { SentenceItem } from "./components/SentenceItem";
import { TransportBar } from "./components/TransportBar";
import { VoiceControls } from "./components/VoiceControls";
import { PdfViewer } from "./components/PdfViewer";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { displayVoiceName } from "./voiceName";
import StyledButton from "./components/StyledButton";
import * as api from "./api";
import "./styles";

const SPLIT_STORAGE_KEY = "pdf-narrator:split-percent";
const SETTINGS_STORAGE_KEY = "pdf-narrator:settings";
const MIN_SPLIT = 25;
const MAX_SPLIT = 75;

/** Below this the two panes cannot both be usable, so they become tabs. */
const NARROW_QUERY = "(max-width: 1024px)";

const DEMO_SENTENCE_PREFIX = "Hello, how are you? I am";
const DEMO_SENTENCE_SUFFIX = "and the weather outside is lovely.";

interface StoredSettings {
  engine?: "pyttsx3" | "piper";
  voiceId?: string | null;
  speed?: number;
}

function readStoredSettings(): StoredSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [appState, dispatchApp] = useReducer(
    appReducer,
    initialAppState,
    (base) => {
      const stored = readStoredSettings();
      return typeof stored.speed === "number"
        ? { ...base, speechSpeed: stored.speed }
        : base;
    },
  );
  const [playbackState, dispatchPlayback] = useReducer(
    playbackReducer,
    initialPlaybackState,
  );

  const {
    playAudio,
    prepare,
    prunePrepared,
    clearPrepared,
    clearPreparedAt,
    stopCurrentAudio,
    cleanup,
    getCurrentAudio,
  } = useAudioManager();

  // Mirror the audio cache into app state so the UI can render from it; the
  // hook itself keeps the authoritative copy in a ref.
  const handleCacheChange = useCallback(
    (newCache: Map<number, AudioCacheEntry>) => {
      dispatchApp({ type: "SET_AUDIO_CACHE", payload: newCache });
    },
    [],
  );

  const {
    getCache,
    ensureAudio,
    prefetchAhead,
    clearCacheEntry,
    cleanupAllCache,
  } = useAudioCache(handleCacheChange);

  const {
    sentences,
    sentencePages,
    pdfFile,
    isLoading,
    error,
    generatingAudioIndex,
    speechSpeed,
    audioCache,
    isContinuousPlayback,
    selectedVoiceId,
    availableVoices,
    voicesLoading,
    currentTtsEngine,
  } = appState;

  // Refs mirroring state that callbacks read, so handlePlay does not have to be
  // re-created (and re-arm stale closures) on every cache write.
  const playbackRef = useRef(playbackState);
  playbackRef.current = playbackState;

  // Dispatch that also updates the ref immediately, so callbacks firing before
  // the next render (e.g. auto-advance on "ended") see the true playback state.
  const dispatchPlaybackSync = useCallback((action: PlaybackAction) => {
    playbackRef.current = playbackReducer(playbackRef.current, action);
    dispatchPlayback(action);
  }, []);

  const isContinuousRef = useRef(isContinuousPlayback);
  isContinuousRef.current = isContinuousPlayback;

  // Lets the "ended" handler call the latest handlePlay without a dependency cycle.
  const handlePlayRef = useRef<
    ((index: number, isRetry?: boolean) => void) | undefined
  >(undefined);

  // Ref for the sentence list container to enable auto-scrolling
  const sentenceListRef = useRef<HTMLDivElement>(null);

  // Function to scroll the currently playing sentence to the center of the view
  const scrollToSentence = useCallback((index: number) => {
    if (!sentenceListRef.current) return;

    // Find the sentence element by its data attribute
    const sentenceElement = sentenceListRef.current.querySelector(
      `[data-sentence-index="${index}"]`,
    ) as HTMLElement;

    if (!sentenceElement) return;

    // Use scrollIntoView with block: 'center' for proper centering within the
    // container. CSS scroll-behavior cannot override this argument, so the
    // reduced-motion preference has to be read here too.
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    sentenceElement.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }, []);

  // File upload handler
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Clear error immediately when a new file is selected
      dispatchApp({ type: "SET_ERROR", payload: null });
      dispatchApp({ type: "SET_LOADING", payload: true });
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      dispatchPlaybackSync({ type: "RESET" });
      dispatchApp({ type: "SET_SENTENCES", payload: [] });
      dispatchApp({ type: "SET_SENTENCE_PAGES", payload: [] });

      // Store the PDF file for the viewer
      dispatchApp({
        type: "SET_PDF_FILE",
        payload: file,
      });

      try {
        const data = await api.uploadPdf(file);
        dispatchApp({ type: "SET_SENTENCES", payload: data.sentences });
        dispatchApp({ type: "SET_SENTENCE_PAGES", payload: data.pages ?? [] });
      } catch (err) {
        dispatchApp({
          type: "SET_ERROR",
          payload:
            err instanceof Error ? err.message : "An unknown error occurred.",
        });
      } finally {
        dispatchApp({ type: "SET_LOADING", payload: false });
      }
    },
    [dispatchPlaybackSync],
  );

  // Kick off generation + buffering of the next sentences while the current one
  // plays, so the handoff at the end of a clip is instant. Fire-and-forget.
  const schedulePrefetch = useCallback(
    (index: number) => {
      prunePrepared(index);
      prefetchAhead(
        index,
        sentences,
        speechSpeed,
        selectedVoiceId,
        LOOKAHEAD,
        (readyIndex, entry) => prepare(readyIndex, entry.url),
      ).catch((err: any) => {
        console.warn("Prefetch failed:", err);
      });
    },
    [
      prefetchAhead,
      sentences,
      speechSpeed,
      selectedVoiceId,
      prepare,
      prunePrepared,
    ],
  );

  // Audio playback handler
  const handlePlay = useCallback(
    async (index: number, isRetry: boolean = false) => {
      if (!sentences[index]) return;

      const playback = playbackRef.current;

      // Allow switching to a different sentence even if currently playing
      const isSwitchingSentence =
        playback.status === "playing" && playback.currentIndex !== index;

      if (playback.status === "playing" && !isSwitchingSentence) {
        return;
      }

      try {
        const cachedAudio = !isRetry ? getCache().get(index) : null;

        // Only show the spinner on a genuine cache miss - prefetched sentences
        // should never flash it.
        if (!cachedAudio) {
          dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: index });
        }

        let entry;
        try {
          entry = await ensureAudio(
            index,
            sentences[index],
            speechSpeed,
            selectedVoiceId,
            { force: isRetry },
          );
        } finally {
          if (!cachedAudio) {
            dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
          }
        }

        if (!entry) {
          throw new Error("Failed to generate audio");
        }

        // Set playing state before starting audio
        dispatchPlaybackSync({ type: "PLAY", payload: index });

        // Start filling the buffer for the sentences after this one right away.
        schedulePrefetch(index);

        await playAudio(
          index,
          entry.url,
          entry.filename,
          () => {
            // On audio ended
            dispatchPlaybackSync({ type: "STOP" });

            // If in continuous playback mode, immediately play the next sentence
            if (isContinuousRef.current && index + 1 < sentences.length) {
              handlePlayRef.current?.(index + 1);
            } else if (
              isContinuousRef.current &&
              index + 1 >= sentences.length
            ) {
              // Reached the end, disable continuous playback
              dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
            }
          },
          (errorMessage: string) => {
            // On audio error
            dispatchPlaybackSync({ type: "STOP" });

            // If this was cached audio that failed and it's not already a retry,
            // try regenerating once
            if (cachedAudio && !isRetry) {
              clearCacheEntry(index);
              clearPreparedAt(index);
              handlePlayRef.current?.(index, true);
              return;
            }

            dispatchApp({ type: "SET_ERROR", payload: errorMessage });
          },
        );
      } catch (err: any) {
        dispatchPlaybackSync({ type: "STOP" });
        dispatchApp({ type: "SET_ERROR", payload: err.message });
      }
    },
    [
      sentences,
      speechSpeed,
      selectedVoiceId,
      getCache,
      ensureAudio,
      playAudio,
      schedulePrefetch,
      clearCacheEntry,
      clearPreparedAt,
      dispatchPlaybackSync,
    ],
  );

  handlePlayRef.current = handlePlay;

  const handleStop = useCallback(async () => {
    try {
      // Disable continuous playback
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });

      // Stop current audio playback
      await stopCurrentAudio();

      // Clear frontend cache
      console.log("Clearing frontend audio cache...");
      cleanupAllCache();
      clearPrepared();

      // Clear backend cache
      console.log("Clearing backend audio cache...");
      const result = await api.clearAudioCache();
      console.log(`Backend cache cleared: ${result.message}`);

      // Reset states
      dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
      dispatchPlaybackSync({ type: "STOP" });
    } catch (error) {
      console.error("Error during cache reset:", error);
      // Still reset the states even if cache clearing fails
      dispatchApp({ type: "SET_GENERATING_AUDIO_INDEX", payload: null });
      dispatchPlaybackSync({ type: "STOP" });
    }
  }, [stopCurrentAudio, cleanupAllCache, clearPrepared, dispatchPlaybackSync]);

  // Simple pause function that doesn't clear cache
  const handlePause = useCallback(async () => {
    try {
      // Disable continuous playback
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });

      // Stop current audio playback without clearing cache
      await stopCurrentAudio();
      dispatchPlaybackSync({ type: "STOP" });
    } catch (error) {
      console.error("Error during pause:", error);
      dispatchPlaybackSync({ type: "STOP" });
    }
  }, [stopCurrentAudio, dispatchPlaybackSync]);

  const handlePlayPause = useCallback(() => {
    if (playbackState.status === "playing") {
      // If currently playing, just stop audio without clearing cache
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      stopCurrentAudio();
      dispatchPlaybackSync({ type: "STOP" });
    } else if (sentences.length > 0) {
      // Start continuous playback from current position
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: true });
      handlePlay(playbackState.currentIndex);
    }
  }, [
    playbackState,
    sentences,
    handlePlay,
    stopCurrentAudio,
    dispatchPlaybackSync,
  ]);

  const handleNext = useCallback(() => {
    const nextIndex = playbackState.currentIndex + 1;
    if (nextIndex < sentences.length) {
      // Disable continuous playback when manually navigating (but don't clear cache)
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      handlePlay(nextIndex);
    }
  }, [playbackState, sentences, handlePlay]);

  const handlePrevious = useCallback(() => {
    const prevIndex = playbackState.currentIndex - 1;
    if (prevIndex >= 0) {
      // Disable continuous playback when manually navigating (but don't clear cache)
      dispatchApp({ type: "SET_CONTINUOUS_PLAYBACK", payload: false });
      handlePlay(prevIndex);
    }
  }, [playbackState, handlePlay]);

  const handleSpeedChange = useCallback((speed: number) => {
    dispatchApp({ type: "SET_SPEECH_SPEED", payload: speed });
  }, []);

  const handleVoiceChange = useCallback((voiceId: string) => {
    dispatchApp({ type: "SET_SELECTED_VOICE", payload: voiceId });
  }, []);

  // Stable cleanup function to avoid dependencies issues
  const stableCleanupCache = useCallback(() => {
    // Prepared elements hold audio generated at the old speed/voice, so they
    // have to go whenever the cache does.
    clearPrepared();
    cleanupAllCache();
  }, [cleanupAllCache, clearPrepared]);

  const handleTtsEngineChange = useCallback(
    async (engine: "pyttsx3" | "piper") => {
      try {
        // Clear cache when switching engines
        stableCleanupCache();

        // Update the backend TTS engine
        await api.setTtsEngine(engine);

        // Update the frontend state
        dispatchApp({ type: "SET_CURRENT_TTS_ENGINE", payload: engine });

        // Clear the selected voice as it might not be available in the new engine
        dispatchApp({ type: "SET_SELECTED_VOICE", payload: null });

        // Reload voices for the new engine
        dispatchApp({ type: "SET_VOICES_LOADING", payload: true });
        const voicesData = await api.getAvailableVoices();
        if (voicesData.success) {
          dispatchApp({
            type: "SET_AVAILABLE_VOICES",
            payload: voicesData.voices,
          });

          // Set the first voice of the new engine as default
          const newEngineVoices = voicesData.voices.filter(
            (v) => v.engine === engine,
          );
          if (newEngineVoices.length > 0) {
            let defaultVoice = newEngineVoices[0];

            // If switching to Piper, try to find Cori voice
            if (engine === "piper") {
              const coriVoice = newEngineVoices.find((v) =>
                v.id.toLowerCase().includes("cori"),
              );
              if (coriVoice) {
                defaultVoice = coriVoice;
              }
            }

            dispatchApp({
              type: "SET_SELECTED_VOICE",
              payload: defaultVoice.id,
            });
          }
        }
      } catch (error) {
        console.error("Error switching TTS engine:", error);
      } finally {
        dispatchApp({ type: "SET_VOICES_LOADING", payload: false });
      }
    },
    [stableCleanupCache],
  );

  // --- Voice demo ----------------------------------------------------------
  // Uses its own audio element so previewing a voice never disturbs the
  // narration's playback state or its prefetch buffer.
  const demoAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  // Bumped on every stop. An in-flight generation compares the token it
  // started with and bails if it has been superseded, so a slow request
  // cannot start playing after the demo was cancelled - which is how demos
  // ended up talking over each other.
  const demoTokenRef = useRef(0);

  const stopDemo = useCallback(() => {
    demoTokenRef.current += 1;

    const audio = demoAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      demoAudioRef.current = null;
    }

    setIsDemoLoading(false);
  }, []);

  const handlePlayDemo = useCallback(async () => {
    stopDemo();

    // The preview and the narration would otherwise talk over each other.
    await handlePause();

    const token = demoTokenRef.current;

    const rawName = availableVoices.find((v) => v.id === selectedVoiceId)?.name;
    const voiceName = rawName ? displayVoiceName(rawName) : "your narrator";
    const text = `${DEMO_SENTENCE_PREFIX} ${voiceName}, ${DEMO_SENTENCE_SUFFIX}`;

    try {
      setIsDemoLoading(true);

      // Index -1 keeps the demo out of the sentence cache's numbering.
      const result = await api.generateAudioIndexed(
        text,
        speechSpeed,
        -1,
        selectedVoiceId ?? undefined,
      );

      if (token !== demoTokenRef.current) return;

      const audio = new Audio(result.audioUrl);
      demoAudioRef.current = audio;
      await audio.play();
    } catch (err) {
      console.warn("Voice demo failed:", err);
    } finally {
      if (token === demoTokenRef.current) setIsDemoLoading(false);
    }
  }, [availableVoices, selectedVoiceId, speechSpeed, stopDemo, handlePause]);

  // Any interaction anywhere else in the UI cuts the demo off immediately.
  // Capture phase, so it runs before the control's own handler; the Preview
  // button marks itself exempt so it can restart the demo rather than kill it.
  useEffect(() => {
    const onInteract = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-demo-control]")) return;
      stopDemo();
    };

    document.addEventListener("pointerdown", onInteract, true);
    document.addEventListener("keydown", onInteract, true);
    return () => {
      document.removeEventListener("pointerdown", onInteract, true);
      document.removeEventListener("keydown", onInteract, true);
    };
  }, [stopDemo]);

  useEffect(() => stopDemo, [stopDemo]);

  const handleDismissError = useCallback(() => {
    dispatchApp({ type: "SET_ERROR", payload: null });
  }, []);

  // Clear cache when speech speed changes
  useEffect(() => {
    stableCleanupCache();
  }, [speechSpeed, stableCleanupCache]);

  // Clear cache when sentences change (new PDF uploaded)
  useEffect(() => {
    stableCleanupCache();
  }, [sentences.length, stableCleanupCache]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      cleanupAllCache();
    };
  }, [cleanup, cleanupAllCache]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle arrow keys if we have sentences
      if (sentences.length === 0) return;

      const target = event.target as HTMLElement | null;

      // Never steal keys from a form control (e.g. the voice dropdown), or
      // from the pane divider, which uses the arrow keys to resize.
      if (
        target?.closest(
          "input, select, textarea, [contenteditable='true'], [role='separator']",
        )
      ) {
        return;
      }

      // Space natively activates a focused button - including a sentence row -
      // so letting it through here would fire that action and global
      // play/pause at the same time.
      if (event.key === " " && target?.closest("button")) return;

      // Prevent default behavior for arrow keys to avoid page scrolling
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
      }

      switch (event.key) {
        case "ArrowLeft":
          handlePrevious();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case " ": // Spacebar for play/pause
          event.preventDefault();
          handlePlayPause();
          break;
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sentences.length, handleNext, handlePrevious, handlePlayPause]);

  // Load voices and TTS engine on mount, honouring anything the user chose in
  // a previous session. The engine is backend state, so a stored choice has to
  // be pushed to the server, not merely reflected in the UI.
  const didRestoreSettings = useRef(false);

  useEffect(() => {
    if (didRestoreSettings.current) return;
    didRestoreSettings.current = true;

    async function loadVoices() {
      try {
        dispatchApp({ type: "SET_VOICES_LOADING", payload: true });
        const stored = readStoredSettings();

        const engineData = await api.getTtsEngine();
        let engine: "pyttsx3" | "piper" = "piper";

        if (engineData.success) {
          engine = engineData.currentEngine as "pyttsx3" | "piper";
          dispatchApp({
            type: "SET_AVAILABLE_TTS_ENGINES",
            payload: engineData.availableEngines,
          });

          if (
            stored.engine &&
            stored.engine !== engine &&
            engineData.availableEngines.includes(stored.engine)
          ) {
            await api.setTtsEngine(stored.engine);
            engine = stored.engine;
          }
        }

        dispatchApp({ type: "SET_CURRENT_TTS_ENGINE", payload: engine });

        const voicesData = await api.getAvailableVoices();
        if (!voicesData.success) {
          console.warn("Failed to load voices:", voicesData);
          return;
        }

        dispatchApp({
          type: "SET_AVAILABLE_VOICES",
          payload: voicesData.voices,
        });

        const engineVoices = voicesData.voices.filter(
          (v) => v.engine === engine,
        );
        const pool = engineVoices.length > 0 ? engineVoices : voicesData.voices;
        if (pool.length === 0) return;

        const restored =
          stored.voiceId && pool.find((v) => v.id === stored.voiceId);

        let chosen = restored || pool[0];
        if (!restored && engine === "piper") {
          const cori = pool.find((v) => v.id.toLowerCase().includes("cori"));
          if (cori) chosen = cori;
        }

        dispatchApp({ type: "SET_SELECTED_VOICE", payload: chosen.id });
      } catch (error) {
        console.error("Error loading voices:", error);
      } finally {
        dispatchApp({ type: "SET_VOICES_LOADING", payload: false });
      }
    }

    loadVoices();
  }, []);

  // Persist the settings that should survive a reload. Skipped until the
  // restore above has run, so an empty initial state cannot overwrite them.
  useEffect(() => {
    if (!didRestoreSettings.current || voicesLoading) return;
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          engine: currentTtsEngine,
          voiceId: selectedVoiceId,
          speed: speechSpeed,
        }),
      );
    } catch {
      // Storage can be unavailable (private mode); settings just won't persist.
    }
  }, [currentTtsEngine, selectedVoiceId, speechSpeed, voicesLoading]);

  // Drive the active sentence's progress bar by writing a CSS custom property
  // on the list container. Going through the DOM rather than React state keeps
  // a 60fps update from re-rendering several hundred sentence rows.
  useEffect(() => {
    const list = sentenceListRef.current;
    if (!list) return;

    const reset = () => list.style.setProperty("--sentence-progress", "0");

    if (playbackState.status !== "playing") {
      reset();
      return;
    }

    let frame = requestAnimationFrame(function tick() {
      const audio = getCurrentAudio();
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        const ratio = Math.min(audio.currentTime / audio.duration, 1);
        list.style.setProperty("--sentence-progress", ratio.toFixed(4));
      }
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      reset();
    };
  }, [playbackState.status, playbackState.currentIndex, getCurrentAudio]);

  // Auto-scroll to the currently playing sentence
  useEffect(() => {
    if (playbackState.status === "playing" && playbackState.currentIndex >= 0) {
      // Add a small delay to ensure the DOM has updated with the new playing state
      const timeoutId = setTimeout(() => {
        scrollToSentence(playbackState.currentIndex);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [playbackState.status, playbackState.currentIndex, scrollToSentence]);

  const hasDocument = sentences.length > 0;

  const isNarrow = useMediaQuery(NARROW_QUERY);
  const [activePane, setActivePane] = useState<"sentences" | "document">(
    "sentences",
  );

  // --- Resizable split between the two panes -------------------------------
  const appBodyRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState<number>(() => {
    const stored = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_SPLIT && stored <= MAX_SPLIT
      ? stored
      : 50;
  });
  const [isResizing, setIsResizing] = useState(false);

  const applySplitFromClientX = useCallback((clientX: number) => {
    const body = appBodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    if (rect.width === 0) return;
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, percent)));
  }, []);

  const handleDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizing(true);
    },
    [],
  );

  const handleDividerPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      applySplitFromClientX(event.clientX);
    },
    [applySplitFromClientX],
  );

  const handleDividerPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsResizing(false);
    },
    [],
  );

  // Keyboard resizing, so the divider is not mouse-only.
  const handleDividerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 10 : 2;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSplitPercent((p) => Math.max(MIN_SPLIT, p - step));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSplitPercent((p) => Math.min(MAX_SPLIT, p + step));
      } else if (event.key === "Home") {
        event.preventDefault();
        setSplitPercent(50);
      }
    },
    [],
  );

  // Suppress text selection and keep the resize cursor while dragging.
  useEffect(() => {
    if (!isResizing) return;
    document.body.classList.add("is-resizing");
    return () => document.body.classList.remove("is-resizing");
  }, [isResizing]);

  useEffect(() => {
    window.localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent));
  }, [splitPercent]);

  const triggerFilePicker = useCallback(() => {
    document.getElementById("file-upload")?.click();
  }, []);

  const fileInput = (
    <input
      id="file-upload"
      type="file"
      name="file"
      accept="application/pdf"
      required
      onChange={handleFileUpload}
      style={{ display: "none" }}
    />
  );

  return (
    <div className="app-shell">
      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} onDismiss={handleDismissError} />}
      {fileInput}

      <div className="sr-only" role="status" aria-live="polite">
        {generatingAudioIndex !== null
          ? `Generating audio for sentence ${generatingAudioIndex + 1}`
          : playbackState.status === "playing"
          ? `Playing sentence ${playbackState.currentIndex + 1} of ${
              sentences.length
            }`
          : ""}
      </div>

      <header className="app-bar">
        <h1 className="app-bar-title">PDF to Audio Converter</h1>

        {pdfFile && (
          <span className="app-bar-file" title={pdfFile.name}>
            <svg
              width="13"
              height="13"
              fill="currentColor"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z" />
            </svg>
            <span className="app-bar-file-name">{pdfFile.name}</span>
          </span>
        )}

        <div className="app-bar-spacer" />

        <div className="app-bar-actions">
          {hasDocument && (
            <StyledButton
              type="toolbar"
              onClick={triggerFilePicker}
              title="Load a different PDF"
            >
              Replace PDF
            </StyledButton>
          )}
          <VoiceControls
            selectedVoiceId={selectedVoiceId}
            onVoiceChange={handleVoiceChange}
            speechSpeed={speechSpeed}
            onSpeedChange={handleSpeedChange}
            voices={availableVoices}
            isLoading={voicesLoading}
            currentTtsEngine={currentTtsEngine}
            onTtsEngineChange={handleTtsEngineChange}
            onPlayDemo={handlePlayDemo}
            isDemoLoading={isDemoLoading}
          />
        </div>
      </header>

      {isNarrow && (
        <div className="pane-tabs" role="tablist" aria-label="Panes">
          <button
            type="button"
            role="tab"
            className={`pane-tab ${activePane === "sentences" ? "is-active" : ""}`}
            aria-selected={activePane === "sentences"}
            onClick={() => setActivePane("sentences")}
          >
            Sentences
          </button>
          <button
            type="button"
            role="tab"
            className={`pane-tab ${activePane === "document" ? "is-active" : ""}`}
            aria-selected={activePane === "document"}
            onClick={() => setActivePane("document")}
          >
            Document
          </button>
        </div>
      )}

      <div
        className="app-body"
        ref={appBodyRef}
        data-active-pane={isNarrow ? activePane : undefined}
        style={
          // Inline styles beat the stylesheet, so the split is only applied
          // when there actually are two side-by-side panes.
          isNarrow
            ? undefined
            : {
                gridTemplateColumns: `${splitPercent}% 0.5rem minmax(0, 1fr)`,
              }
        }
      >
        <section className="pane pane-sentences">
          {hasDocument ? (
            <>
              <div className="pane-header">
                <h2 className="pane-title">Extracted Sentences</h2>
                <span className="pane-count">{sentences.length} sentences</span>
              </div>

              <div className="sentence-list" ref={sentenceListRef}>
                {sentences.map((sentence, index) => (
                  <SentenceItem
                    key={index}
                    sentence={sentence}
                    index={index}
                    onPlay={() => {
                      // Disable continuous playback when manually selecting a sentence
                      dispatchApp({
                        type: "SET_CONTINUOUS_PLAYBACK",
                        payload: false,
                      });
                      handlePlay(index);
                    }}
                    onStop={handlePause}
                    isPlaying={
                      playbackState.status === "playing" &&
                      playbackState.currentIndex === index
                    }
                    isLastPlayed={playbackState.currentIndex === index}
                    isGeneratingAudio={generatingAudioIndex === index}
                  />
                ))}
              </div>

              <TransportBar
                onPlayPause={handlePlayPause}
                onNext={handleNext}
                onPrevious={handlePrevious}
                onStop={handleStop}
                isPlaying={playbackState.status === "playing"}
                cachedCount={audioCache.size}
                currentIndex={playbackState.currentIndex}
                totalSentences={sentences.length}
              />
            </>
          ) : (
            <div className="empty-state">
              <div className="upload-box">
                <StyledButton type="upload" onClick={triggerFilePicker}>
                  Select PDF to Upload
                </StyledButton>
                <p className="upload-text">
                  The conversion will start automatically.
                </p>
              </div>
              <footer className="footer">
                <p>
                  React Frontend | Node.js &amp; Python Backend | TTS Engine |
                  Created with Claude Sonnet 4
                </p>
              </footer>
            </div>
          )}
        </section>

        <div
          className={`pane-divider ${isResizing ? "is-resizing" : ""}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          aria-valuenow={Math.round(splitPercent)}
          aria-valuemin={MIN_SPLIT}
          aria-valuemax={MAX_SPLIT}
          tabIndex={0}
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={handleDividerPointerUp}
          onPointerCancel={handleDividerPointerUp}
          onDoubleClick={() => setSplitPercent(50)}
          onKeyDown={handleDividerKeyDown}
        />

        <section className="pane pane-document">
          <div className="pdf-preview-container">
            <PdfViewer
              file={pdfFile}
              className="pdf-preview-iframe"
              activePage={sentencePages[playbackState.currentIndex] ?? null}
              activeSentence={sentences[playbackState.currentIndex] ?? null}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
