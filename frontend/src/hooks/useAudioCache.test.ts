import { renderHook, act, waitFor } from "@testing-library/react";
import { useAudioCache, LOOKAHEAD } from "./useAudioCache";
import * as api from "../api";

jest.mock("../api");
const mockedApi = api as jest.Mocked<typeof api>;

const SENTENCES = Array.from({ length: 20 }, (_, i) => `Sentence number ${i}.`);

/** Resolves generateAudioIndexed only when the test says so. */
function deferredGenerator() {
  const resolvers: Array<(v: any) => void> = [];
  mockedApi.generateAudioIndexed.mockImplementation(
    (_s, _speed, index) =>
      new Promise((resolve) => {
        resolvers.push(() =>
          resolve({
            audioUrl: `http://x/audio/idx${index}.mp3`,
            filename: `idx${index}.mp3`,
            cached: false,
          })
        );
      })
  );
  return {
    flush: () => resolvers.splice(0).forEach((r) => r(undefined)),
    count: () => resolvers.length,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.cleanupAudio.mockResolvedValue(undefined);
  mockedApi.generateAudioIndexed.mockImplementation(async (_s, _speed, index) => ({
    audioUrl: `http://x/audio/idx${index}.mp3`,
    filename: `idx${index}.mp3`,
    cached: false,
  }));
});

test("concurrent callers for the same sentence share one backend request", async () => {
  const { result } = renderHook(() => useAudioCache());
  const gen = deferredGenerator();

  let a: any, b: any;
  act(() => {
    a = result.current.ensureAudio(3, SENTENCES[3], 180, null);
    b = result.current.ensureAudio(3, SENTENCES[3], 180, null);
  });

  // Both callers are waiting on a single in-flight request.
  expect(mockedApi.generateAudioIndexed).toHaveBeenCalledTimes(1);

  await act(async () => {
    gen.flush();
    await Promise.all([a, b]);
  });

  expect(await a).toEqual(await b);
  expect(mockedApi.generateAudioIndexed).toHaveBeenCalledTimes(1);
});

test("a cache hit resolves without touching the backend", async () => {
  const { result } = renderHook(() => useAudioCache());

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], 180, null);
  });
  expect(mockedApi.generateAudioIndexed).toHaveBeenCalledTimes(1);

  let second: any;
  await act(async () => {
    second = await result.current.ensureAudio(0, SENTENCES[0], 180, null);
  });
  expect(mockedApi.generateAudioIndexed).toHaveBeenCalledTimes(1);
  expect(second.filename).toBe("idx0.mp3");
});

test("force regenerates even when cached (the retry path)", async () => {
  const { result } = renderHook(() => useAudioCache());

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], 180, null);
    await result.current.ensureAudio(0, SENTENCES[0], 180, null, { force: true });
  });

  expect(mockedApi.generateAudioIndexed).toHaveBeenCalledTimes(2);
});

test("prefetchAhead generates the lookahead window plus the previous sentence", async () => {
  const { result } = renderHook(() => useAudioCache());
  const ready: number[] = [];

  await act(async () => {
    await result.current.prefetchAhead(
      5,
      SENTENCES,
      180,
      null,
      LOOKAHEAD,
      (index) => ready.push(index)
    );
  });

  const requested = mockedApi.generateAudioIndexed.mock.calls
    .map((c) => c[2])
    .sort((a, b) => (a as number) - (b as number));
  expect(requested).toEqual([4, 6, 7]);
  // Nearest-first ordering: N+1 must win the race for the TTS process.
  expect(ready).toEqual([6, 7, 4]);
});

test("prefetchAhead does not run past the end of the document", async () => {
  const { result } = renderHook(() => useAudioCache());
  const short = ["only", "two"];

  await act(async () => {
    await result.current.prefetchAhead(1, short, 180, null, LOOKAHEAD);
  });

  const requested = mockedApi.generateAudioIndexed.mock.calls.map((c) => c[2]);
  expect(requested).toEqual([0]); // just the previous one
});

test("cache eviction never drops the lookahead window", async () => {
  const { result } = renderHook(() => useAudioCache());

  // Fill well past the cache limit.
  await act(async () => {
    for (let i = 0; i <= 12; i++) {
      await result.current.ensureAudio(i, SENTENCES[i], 180, null);
    }
  });

  act(() => {
    result.current.manageCacheSize(10);
  });

  const keys = Array.from(result.current.getCache().keys());
  for (let i = 10 - 1; i <= 10 + LOOKAHEAD; i++) {
    expect(keys).toContain(i);
  }
  // Distant entries were dropped and their files cleaned up server-side.
  expect(keys).not.toContain(0);
  expect(mockedApi.cleanupAudio).toHaveBeenCalled();
});

test("cleanupAllCache deletes every file and empties the cache", async () => {
  const { result } = renderHook(() => useAudioCache());

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], 180, null);
    await result.current.ensureAudio(1, SENTENCES[1], 180, null);
  });

  act(() => {
    result.current.cleanupAllCache();
  });

  expect(mockedApi.cleanupAudio).toHaveBeenCalledWith("idx0.mp3");
  expect(mockedApi.cleanupAudio).toHaveBeenCalledWith("idx1.mp3");
  expect(result.current.getCache().size).toBe(0);
});

test("a failed generation does not poison the pending map", async () => {
  const { result } = renderHook(() => useAudioCache());
  mockedApi.generateAudioIndexed.mockRejectedValueOnce(new Error("boom"));

  let first: any;
  await act(async () => {
    first = await result.current.ensureAudio(2, SENTENCES[2], 180, null);
  });
  expect(first).toBeNull();

  // A later attempt must be able to retry rather than reuse the dead promise.
  await act(async () => {
    await result.current.ensureAudio(2, SENTENCES[2], 180, null);
  });
  expect(mockedApi.generateAudioIndexed).toHaveBeenCalledTimes(2);
  expect(result.current.getCache().has(2)).toBe(true);
});
