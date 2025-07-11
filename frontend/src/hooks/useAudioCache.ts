import { useCallback } from "react";
import * as api from "../api";
import { AudioCacheEntry } from "../types";

export function useAudioCache() {
  const manageCacheSize = useCallback(
    (
      audioCache: Map<number, AudioCacheEntry>,
      currentIndex: number,
      maxCacheSize: number = 10,
      updateCache: (newCache: Map<number, AudioCacheEntry>) => void
    ) => {
      if (audioCache.size <= maxCacheSize) return;

      const newCache = new Map(audioCache);
      const entriesToRemove: number[] = [];

      // Sort entries by distance from current index
      const entriesByDistance = Array.from(audioCache.keys())
        .map((index) => ({ index, distance: Math.abs(index - currentIndex) }))
        .sort((a, b) => b.distance - a.distance);

      // Remove the most distant entries until we're under the limit
      const excessCount = audioCache.size - maxCacheSize;
      for (let i = 0; i < excessCount && i < entriesByDistance.length; i++) {
        const entryIndex = entriesByDistance[i].index;
        // Don't remove the current playing sentence or immediately adjacent ones
        if (Math.abs(entryIndex - currentIndex) > 2) {
          entriesToRemove.push(entryIndex);
        }
      }

      // Remove the selected entries and cleanup files
      entriesToRemove.forEach((index) => {
        const entry = newCache.get(index);
        if (entry) {
          api.cleanupAudio(entry.filename).catch((err) => {
            console.warn("Failed to cleanup distant audio file:", err);
          });
          newCache.delete(index);
        }
      });

      console.log(
        `Cache management: removed ${entriesToRemove.length} distant entries, cache size: ${newCache.size}`
      );
      updateCache(newCache);
    },
    []
  );

  const clearCacheEntry = useCallback(
    (
      audioCache: Map<number, AudioCacheEntry>,
      index: number,
      updateCache: (newCache: Map<number, AudioCacheEntry>) => void
    ) => {
      const newCache = new Map(audioCache);
      const entry = newCache.get(index);
      if (entry) {
        // Cleanup the audio file from server
        api.cleanupAudio(entry.filename).catch((err) => {
          console.warn("Failed to cleanup audio file:", err);
        });
        newCache.delete(index);
        updateCache(newCache);
      }
    },
    []
  );

  const generateAudioForSentence = useCallback(
    async (
      sentence: string,
      speechSpeed: number,
      index: number,
      audioCache: Map<number, AudioCacheEntry>,
      updateCache: (newCache: Map<number, AudioCacheEntry>) => void
    ): Promise<string | null> => {
      if (!sentence) return null;

      try {
        const response = await api.generateAudioIndexed(
          sentence,
          speechSpeed,
          index
        );
        const audioUrl = response.audioUrl;
        const filename = response.filename;

        // Store in cache
        const newCache = new Map(audioCache);
        newCache.set(index, { url: audioUrl, filename });
        updateCache(newCache);

        // Manage cache size after adding new entry (with slight delay to ensure state update)
        setTimeout(
          () => manageCacheSize(newCache, index, 10, updateCache),
          100
        );

        return audioUrl;
      } catch (err: any) {
        console.warn(
          `Failed to generate audio for sentence ${index + 1}:`,
          err.message
        );
        return null;
      }
    },
    [manageCacheSize]
  );

  const preloadAdjacentSentences = useCallback(
    async (
      currentIndex: number,
      sentences: string[],
      audioCache: Map<number, AudioCacheEntry>,
      speechSpeed: number,
      updateCache: (newCache: Map<number, AudioCacheEntry>) => void
    ) => {
      const indicesToPreload = [];

      // Add previous sentence if it exists and not already cached
      if (currentIndex > 0 && !audioCache.has(currentIndex - 1)) {
        indicesToPreload.push(currentIndex - 1);
      }

      // Add next sentence if it exists and not already cached
      if (
        currentIndex + 1 < sentences.length &&
        !audioCache.has(currentIndex + 1)
      ) {
        indicesToPreload.push(currentIndex + 1);
      }

      // Generate audio for each sentence sequentially
      for (const index of indicesToPreload) {
        try {
          await generateAudioForSentence(
            sentences[index],
            speechSpeed,
            index,
            audioCache,
            updateCache
          );
          // Small delay between requests to be gentle on the backend
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (err) {
          console.warn(`Failed to preload sentence ${index + 1}:`, err);
        }
      }
    },
    [generateAudioForSentence]
  );

  const cleanupAllCache = useCallback(
    (audioCache: Map<number, AudioCacheEntry>) => {
      audioCache.forEach((entry) => {
        api.cleanupAudio(entry.filename).catch((err) => {
          console.warn("Failed to cleanup cached audio file:", err);
        });
      });
    },
    []
  );

  return {
    manageCacheSize,
    clearCacheEntry,
    generateAudioForSentence,
    preloadAdjacentSentences,
    cleanupAllCache,
  };
}
