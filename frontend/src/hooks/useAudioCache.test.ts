import { renderHook, act, waitFor } from "@testing-library/react";
import { useAudioCache, LOOKAHEAD } from "./useAudioCache";
import * as api from "../api";

jest.mock("../api");
const mockedApi = api as jest.Mocked<typeof api>;

const SENTENCES = Array.from({ length: 20 }, (_, i) => `Sentence number ${i}.`);
const SETTINGS = { speed: 180, voiceId: null, engine: "piper" };

/** Resolves generateAudio only when the test says so. */
function deferredGenerator() {
  const resolvers: Array<(v: any) => void> = [];
  mockedApi.generateAudio.mockImplementation(
    (sentence) =>
      new Promise((resolve) => {
        const index = SENTENCES.indexOf(sentence);
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
  mockedApi.generateAudio.mockImplementation(async (sentence) => {
    const index = SENTENCES.indexOf(sentence);
    return { audioUrl: `http://x/audio/idx${index}.mp3`, filename: `idx${index}.mp3`, cached: false };
  });
});

test("concurrent callers for the same sentence share one backend request", async () => {
  const { result } = renderHook(() => useAudioCache());
  const gen = deferredGenerator();

  let a: any, b: any;
  act(() => {
    a = result.current.ensureAudio(3, SENTENCES[3], SETTINGS);
    b = result.current.ensureAudio(3, SENTENCES[3], SETTINGS);
  });

  // Both callers are waiting on a single in-flight request.
  expect(mockedApi.generateAudio).toHaveBeenCalledTimes(1);

  await act(async () => {
    gen.flush();
    await Promise.all([a, b]);
  });

  expect(await a).toEqual(await b);
  expect(mockedApi.generateAudio).toHaveBeenCalledTimes(1);
});

test("a cache hit resolves without touching the backend", async () => {
  const { result } = renderHook(() => useAudioCache());

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], SETTINGS);
  });
  expect(mockedApi.generateAudio).toHaveBeenCalledTimes(1);

  let second: any;
  await act(async () => {
    second = await result.current.ensureAudio(0, SENTENCES[0], SETTINGS);
  });
  expect(mockedApi.generateAudio).toHaveBeenCalledTimes(1);
  expect(second.filename).toBe("idx0.mp3");
});

test("force regenerates even when cached (the retry path)", async () => {
  const { result } = renderHook(() => useAudioCache());

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], SETTINGS);
    await result.current.ensureAudio(0, SENTENCES[0], SETTINGS, { force: true });
  });

  expect(mockedApi.generateAudio).toHaveBeenCalledTimes(2);
});

test("prefetchAhead generates the lookahead window plus the previous sentence", async () => {
  const { result } = renderHook(() => useAudioCache());
  const ready: number[] = [];

  await act(async () => {
    await result.current.prefetchAhead(
      5,
      SENTENCES,
      SETTINGS,
      LOOKAHEAD,
      (index: number) => ready.push(index)
    );
  });

  const requested = mockedApi.generateAudio.mock.calls
    .map(([sentence]) => SENTENCES.indexOf(sentence))
    .sort((a, b) => a - b);
  expect(requested).toEqual([4, 6, 7]);
  // Nearest-first ordering: N+1 must win the race for the TTS process.
  expect(ready).toEqual([6, 7, 4]);
});

test("prefetchAhead does not run past the end of the document", async () => {
  const { result } = renderHook(() => useAudioCache());
  const short = ["only", "two"];

  await act(async () => {
    await result.current.prefetchAhead(1, short, SETTINGS, LOOKAHEAD);
  });

  const requested = mockedApi.generateAudio.mock.calls.map(([sentence]) => sentence);
  expect(requested).toEqual(["only"]); // just the previous one
});

test("cache eviction never drops the lookahead window", async () => {
  const { result } = renderHook(() => useAudioCache());

  // Fill well past the cache limit.
  await act(async () => {
    for (let i = 0; i <= 12; i++) {
      await result.current.ensureAudio(i, SENTENCES[i], SETTINGS);
    }
  });

  act(() => {
    result.current.manageCacheSize(10);
  });

  const cached = (i: number) => result.current.getAudio(i, SENTENCES[i], SETTINGS);
  for (let i = 10 - 1; i <= 10 + LOOKAHEAD; i++) {
    expect(cached(i)).toBeDefined();
  }
  expect(cached(0)).toBeUndefined();
});

test("clearCache forgets every entry", async () => {
  const { result } = renderHook(() => useAudioCache());

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], SETTINGS);
    await result.current.ensureAudio(1, SENTENCES[1], SETTINGS);
  });

  act(() => {
    result.current.clearCache();
  });

  expect(result.current.getAudio(0, SENTENCES[0], SETTINGS)).toBeUndefined();
  expect(result.current.getAudio(1, SENTENCES[1], SETTINGS)).toBeUndefined();
});

test("an entry only answers for the sentence and settings it was made with", async () => {
  const { result } = renderHook(() => useAudioCache());

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], SETTINGS);
  });

  // A new voice, speed or engine - or another document's sentence 0 - is a
  // different recording, so it must miss rather than replay the old one.
  const changed = [
    { ...SETTINGS, voiceId: "en_GB-cori-high" },
    { ...SETTINGS, speed: 220 },
    { ...SETTINGS, engine: "pyttsx3" },
  ];
  for (const settings of changed) {
    expect(result.current.getAudio(0, SENTENCES[0], settings)).toBeUndefined();
  }
  expect(result.current.getAudio(0, "Another document's opening.", SETTINGS)).toBeUndefined();

  await act(async () => {
    await result.current.ensureAudio(0, SENTENCES[0], changed[0]);
  });
  expect(mockedApi.generateAudio).toHaveBeenCalledTimes(2);
});

test("a failed generation does not poison the pending map", async () => {
  const { result } = renderHook(() => useAudioCache());
  mockedApi.generateAudio.mockRejectedValueOnce(new Error("boom"));

  let first: any;
  await act(async () => {
    first = await result.current.ensureAudio(2, SENTENCES[2], SETTINGS);
  });
  expect(first).toBeNull();

  // A later attempt must be able to retry rather than reuse the dead promise.
  await act(async () => {
    await result.current.ensureAudio(2, SENTENCES[2], SETTINGS);
  });
  expect(mockedApi.generateAudio).toHaveBeenCalledTimes(2);
  expect(result.current.getAudio(2, SENTENCES[2], SETTINGS)).toBeDefined();
});
