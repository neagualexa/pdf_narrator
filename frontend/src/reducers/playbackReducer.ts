import { PlaybackState, PlaybackAction } from "../types";

export const initialPlaybackState: PlaybackState = {
  status: "idle",
  currentIndex: 0,
};

export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case "PLAY":
      return { ...state, status: "playing", currentIndex: action.payload };
    case "STOP":
      return { ...state, status: "idle" };
    case "SET_INDEX":
      return { ...state, currentIndex: action.payload };
    case "RESET":
      return { status: "idle", currentIndex: 0 };
    default:
      return state;
  }
}
