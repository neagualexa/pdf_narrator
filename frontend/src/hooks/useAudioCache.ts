import { useCallback, useRef } from "react";
import * as api from "../api";
import { AudioCacheEntry } from "../types";

export const LOOKAHEAD = 2;

/**
 * Owns the sentence -> audio file cache.
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
  const pendingRef = useRef<Map<number, Promise<AudioCacheEntry | null>>>(
    new Map(),
  );

  // Keep the callback in a ref so the returned functions stay stable.
  const onCacheChangeRef = useRef(onCacheChange);
  onCacheChangeRef.current = onCacheChange;

  const publishCache = useCallback(() => {
    onCacheChangeRef.current?.(new Map(cacheRef.current));
  }, []);

  const getCache = useCallback(() => cacheRef.current, []);

  const isPending = useCallback(
    (index: number) => pendingRef.current.has(index),
    [],
  );

  /**
   * Drops cache entries that are outside the window we still care about
   * ([currentIndex - 1, currentIndex + LOOKAHEAD]) once the cache grows past
   * `maxCacheSize`, deleting the backing files on the server.
   */
  const manageCacheSize = useCallback(
    (currentIndex: number, maxCacheSize: number = LOOKAHEAD + 3) => {
      if (cacheRef.current.size <= maxCacheSize) return;

      const keepFrom = currentIndex - 1;
      const keepTo = currentIndex + LOOKAHEAD;

      // Furthest entries first, so we drop the least useful ones.
      const evictable = Array.from(cacheRef.current.keys())
        .filter((index) => index < keepFrom || index > keepTo)
        .map((index) => ({ index, distance: Math.abs(index - currentIndex) }))
        .sort((a, b) => b.distance - a.distance);

      const excessCount = cacheRef.current.size - maxCacheSize;
      const removed: number[] = [];

      for (let i = 0; i < excessCount && i < evictable.length; i++) {
        const entryIndex = evictable[i].index;
        const entry = cacheRef.current.get(entryIndex);
        if (!entry) continue;

        api.cleanupAudio(entry.filename).catch((err) => {
          console.warn("Failed to cleanup distant audio file:", err);
        });
        cacheRef.current.delete(entryIndex);
        removed.push(entryIndex);
      }

      if (removed.length > 0) {
        console.log(
          `Cache management: removed ${removed.length} distant entries, cache size: ${cacheRef.current.size}`,
        );
        publishCache();
      }
    },
    [publishCache],
  );

  const clearCacheEntry = useCallback(
    (index: number) => {
      pendingRef.current.delete(index);

      const entry = cacheRef.current.get(index);
      if (entry) {
        // Cleanup the audio file from server
        api.cleanupAudio(entry.filename).catch((err) => {
          console.warn("Failed to cleanup audio file:", err);
        });
        cacheRef.current.delete(index);
        publishCache();
      }
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
      speechSpeed: number,
      voiceId?: string | null,
      options?: { force?: boolean },
    ): Promise<AudioCacheEntry | null> => {
      if (!sentence) return Promise.resolve(null);

      if (options?.force) {
        cacheRef.current.delete(index);
        pendingRef.current.delete(index);
      } else {
        const cached = cacheRef.current.get(index);
        if (cached) return Promise.resolve(cached);

        const pending = pendingRef.current.get(index);
        if (pending) return pending;
      }

      const request = api
        .generateAudioIndexed(
          sentence,
          speechSpeed,
          index,
          voiceId || undefined,
        )
        .then((response) => {
          const entry: AudioCacheEntry = {
            url: response.audioUrl,
            filename: response.filename,
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
          if (pendingRef.current.get(index) === request) {
            pendingRef.current.delete(index);
          }
        });

      pendingRef.current.set(index, request);
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
      speechSpeed: number,
      voiceId?: string | null,
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
        if (cacheRef.current.has(index)) {
          // Already available - still let the caller buffer it.
          onReady?.(index, cacheRef.current.get(index)!);
          continue;
        }

        try {
          const entry = await ensureAudio(
            index,
            sentences[index],
            speechSpeed,
            voiceId,
          );
          if (entry) onReady?.(index, entry);
        } catch (err) {
          console.warn(`Failed to prefetch sentence ${index + 1}:`, err);
        }
      }

      manageCacheSize(currentIndex);
    },
    [ensureAudio, manageCacheSize],
  );

  const cleanupAllCache = useCallback(() => {
    pendingRef.current.clear();

    if (cacheRef.current.size === 0) return;

    cacheRef.current.forEach((entry) => {
      api.cleanupAudio(entry.filename).catch((err) => {
        console.warn("Failed to cleanup cached audio file:", err);
      });
    });
    cacheRef.current = new Map();
    publishCache();
  }, [publishCache]);

  return {
    getCache,
    isPending,
    ensureAudio,
    prefetchAhead,
    manageCacheSize,
    clearCacheEntry,
    cleanupAllCache,
  };
}
