import { useCallback, useRef } from "react";
import * as api from "../api";
import { AudioCacheEntry } from "../types";

export const LOOKAHEAD = 2;

/** Everything that changes what a sentence sounds like, bar its text. */
export interface SpeechSettings {
  /** Words per minute. */
  speed: number;
  voiceId?: string | null;
  engine: string;
}

/**
 * What an entry was made from. An entry only answers for the same sentence
 * spoken the same way, so changing the speed, voice or engine - or loading a
 * new document - needs no invalidation: older entries just stop matching.
 */
function speechKey(sentence: string, { speed, voiceId, engine }: SpeechSettings) {
  return JSON.stringify([engine, voiceId ?? null, speed, sentence]);
}

/**
 * Owns the sentence -> audio cache, a window of sentences around the one
 * playing. The audio files themselves belong to the server, which keeps them
 * by content and expires them by age; dropping an entry here only forgets
 * its url.
 *
 * The cache lives in a ref rather than in reducer state so that concurrent
 * prefetches never clobber each other with a stale snapshot of the Map. The
 * ref is mirrored into app state via `onCacheChange` purely so the UI can
 * render cache-dependent bits.
 */
export function useAudioCache(
  onCacheChange?: (newCache: Map<number, AudioCacheEntry>) => void,
) {
  const cacheRef = useRef<Map<number, AudioCacheEntry>>(new Map());
  const pendingRef = useRef<
    Map<number, { key: string; request: Promise<AudioCacheEntry | null> }>
  >(new Map());

  // Keep the callback in a ref so the returned functions stay stable.
  const onCacheChangeRef = useRef(onCacheChange);
  onCacheChangeRef.current = onCacheChange;

  const publishCache = useCallback(() => {
    onCacheChangeRef.current?.(new Map(cacheRef.current));
  }, []);

  /** The cached audio for a sentence spoken with `settings`, if any. */
  const getAudio = useCallback(
    (index: number, sentence: string, settings: SpeechSettings) => {
      const entry = cacheRef.current.get(index);
      return entry?.key === speechKey(sentence, settings) ? entry : undefined;
    },
    [],
  );

  /**
   * Forgets entries outside the window still wanted
   * ([currentIndex - 1, currentIndex + LOOKAHEAD]) once the cache grows past
   * `maxCacheSize`.
   */
  const manageCacheSize = useCallback(
    (currentIndex: number, maxCacheSize: number = LOOKAHEAD + 3) => {
      if (cacheRef.current.size <= maxCacheSize) return;

      const keepFrom = currentIndex - 1;
      const keepTo = currentIndex + LOOKAHEAD;

      // Furthest entries first, so we drop the least useful ones.
      const evictable = Array.from(cacheRef.current.keys())
        .filter((index) => index < keepFrom || index > keepTo)
        .sort((a, b) => Math.abs(b - currentIndex) - Math.abs(a - currentIndex));

      const excess = cacheRef.current.size - maxCacheSize;
      evictable.slice(0, excess).forEach((index) => cacheRef.current.delete(index));
      if (excess > 0 && evictable.length > 0) publishCache();
    },
    [publishCache],
  );

  /**
   * Returns the audio for a sentence, generating it only if we don't already
   * have it (or already have a request in flight for it). Concurrent callers
   * for the same index share a single backend request.
   */
  const ensureAudio = useCallback(
    (
      index: number,
      sentence: string,
      settings: SpeechSettings,
      options?: { force?: boolean },
    ): Promise<AudioCacheEntry | null> => {
      if (!sentence) return Promise.resolve(null);

      const key = speechKey(sentence, settings);
      if (!options?.force) {
        const cached = cacheRef.current.get(index);
        if (cached?.key === key) return Promise.resolve(cached);

        const pending = pendingRef.current.get(index);
        if (pending?.key === key) return pending.request;
      }

      const request = api
        .generateAudio(sentence, settings.speed, settings.voiceId || undefined)
        .then((response) => {
          const entry: AudioCacheEntry = {
            url: response.audioUrl,
            filename: response.filename,
            key,
          };
          cacheRef.current.set(index, entry);
          publishCache();
          return entry;
        })
        .catch((err: any) => {
          console.warn(
            `Failed to generate audio for sentence ${index + 1}:`,
            err.message,
          );
          return null;
        })
        .finally(() => {
          if (pendingRef.current.get(index)?.request === request) {
            pendingRef.current.delete(index);
          }
        });

      pendingRef.current.set(index, { key, request });
      return request;
    },
    [publishCache],
  );

  /**
   * Generates the next `lookahead` sentences (and the previous one, for
   * backwards navigation) ahead of time so playback can continue without a
   * gap. Requests run sequentially: the nearest sentence must win the race for
   * the single TTS process on the backend.
   */
  const prefetchAhead = useCallback(
    async (
      currentIndex: number,
      sentences: string[],
      settings: SpeechSettings,
      lookahead: number = LOOKAHEAD,
      onReady?: (index: number, entry: AudioCacheEntry) => void,
    ) => {
      const indices: number[] = [];
      for (let offset = 1; offset <= lookahead; offset++) {
        const index = currentIndex + offset;
        if (index < sentences.length) indices.push(index);
      }
      if (currentIndex > 0) indices.push(currentIndex - 1);

      for (const index of indices) {
        // A cache hit resolves at once, and is still handed to the caller to
        // buffer.
        const entry = await ensureAudio(index, sentences[index], settings);
        if (entry) onReady?.(index, entry);
      }

      manageCacheSize(currentIndex);
    },
    [ensureAudio, manageCacheSize],
  );

  const clearCache = useCallback(() => {
    pendingRef.current.clear();
    if (cacheRef.current.size === 0) return;
    cacheRef.current = new Map();
    publishCache();
  }, [publishCache]);

  return {
    getAudio,
    ensureAudio,
    prefetchAhead,
    manageCacheSize,
    clearCache,
  };
}
