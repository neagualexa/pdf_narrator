import { renderHook, act } from "@testing-library/react";
import { useAudioManager } from "./useAudioManager";
import { LOOKAHEAD } from "./useAudioCache";
import * as api from "../api";

jest.mock("../api");
const mockedApi = api as jest.Mocked<typeof api>;

// jsdom implements neither play() nor load() on HTMLMediaElement.
const playSpy = jest.fn().mockResolvedValue(undefined);
const loadSpy = jest.fn();
const pauseSpy = jest.fn();

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: playSpy,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: loadSpy,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: pauseSpy,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.stopAudio.mockResolvedValue(undefined);
  mockedApi.cleanupAudio.mockResolvedValue(undefined);
});

const URL_FOR = (i: number) => `http://localhost:3001/audio/idx${i}.mp3`;

test("prepare buffers ahead: sets preload=auto and calls load()", () => {
  const { result } = renderHook(() => useAudioManager());

  act(() => {
    result.current.prepare(1, URL_FOR(1));
  });

  expect(loadSpy).toHaveBeenCalled();
});

test("playing a prepared sentence reuses the buffered element", async () => {
  const { result } = renderHook(() => useAudioManager());

  act(() => {
    result.current.prepare(1, URL_FOR(1));
  });
  const loadsAfterPrepare = loadSpy.mock.calls.length;

  await act(async () => {
    await result.current.playAudio(
      1,
      URL_FOR(1),
      "idx1.mp3",
      () => {},
      () => {}
    );
  });

  // Reused, not re-created: no extra load() and playback started.
  expect(loadSpy.mock.calls.length).toBe(loadsAfterPrepare);
  expect(playSpy).toHaveBeenCalledTimes(1);
});

test("auto-advance does NOT hit the backend /stop endpoint", async () => {
  const { result } = renderHook(() => useAudioManager());

  await act(async () => {
    await result.current.playAudio(0, URL_FOR(0), "idx0.mp3", () => {}, () => {});
  });
  await act(async () => {
    await result.current.playAudio(1, URL_FOR(1), "idx1.mp3", () => {}, () => {});
  });

  // This is the fix: /stop would kill in-flight prefetch generation.
  expect(mockedApi.stopAudio).not.toHaveBeenCalled();
  expect(playSpy).toHaveBeenCalledTimes(2);
});

test("explicit stop still kills backend generation", async () => {
  const { result } = renderHook(() => useAudioManager());

  await act(async () => {
    await result.current.stopCurrentAudio();
  });

  expect(mockedApi.stopAudio).toHaveBeenCalledTimes(1);
});

test("a prepared element with a stale url is discarded, not played", async () => {
  const { result } = renderHook(() => useAudioManager());

  act(() => {
    result.current.prepare(2, URL_FOR(2));
  });

  // Sentence 2 was regenerated at a new url (e.g. after a speed change).
  const fresh = "http://localhost:3001/audio/idx2-regenerated.mp3";
  await act(async () => {
    await result.current.playAudio(2, fresh, "idx2-regenerated.mp3", () => {}, () => {});
  });

  expect(result.current.getCurrentAudio()?.src).toBe(fresh);
});

test("prunePrepared keeps the window and releases everything outside it", () => {
  const { result } = renderHook(() => useAudioManager());

  act(() => {
    for (let i = 0; i <= 10; i++) result.current.prepare(i, URL_FOR(i));
    result.current.prunePrepared(5);
  });

  // Anything still buffered must be playable; the pruned ones were released.
  // Re-preparing an index inside the window must be a no-op (still buffered),
  // while one outside must rebuild.
  const loadsBefore = loadSpy.mock.calls.length;
  act(() => {
    result.current.prepare(5 + LOOKAHEAD, URL_FOR(5 + LOOKAHEAD));
  });
  expect(loadSpy.mock.calls.length).toBe(loadsBefore); // kept

  act(() => {
    result.current.prepare(10, URL_FOR(10));
  });
  expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBefore); // was pruned
});

test("the ended handler fires for the current sentence and is superseded on switch", async () => {
  const { result } = renderHook(() => useAudioManager());
  const endedA = jest.fn();
  const endedB = jest.fn();

  await act(async () => {
    await result.current.playAudio(0, URL_FOR(0), "idx0.mp3", endedA, () => {});
  });
  const audioA = result.current.getCurrentAudio()!;

  // User jumps to another sentence mid-playback.
  await act(async () => {
    await result.current.playAudio(7, URL_FOR(7), "idx7.mp3", endedB, () => {});
  });

  // The stale element finishing must not advance playback.
  act(() => {
    audioA.dispatchEvent(new Event("ended"));
  });
  expect(endedA).not.toHaveBeenCalled();

  act(() => {
    result.current.getCurrentAudio()!.dispatchEvent(new Event("ended"));
  });
  expect(endedB).toHaveBeenCalledTimes(1);
});
