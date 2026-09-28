// Measured from public/baba/blink.mp4 by reading how much eye-white each frame
// shows: [left top, left bottom, right top, right bottom] as % of each eye box.
// The irises are clipped to these, so the lids always cover them. The
// long closed stretch was cut to six frames in both the clip and this table.
export const BLINK: { fps: number; frames: [number, number, number, number][] } = {
  fps: 24,
  frames: [
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
    [25.0, 1.1, 28.3, 1.1],
    [25.0, 1.1, 28.3, 1.1],
    [43.5, 1.1, 45.7, 1.1],
    [43.5, 1.1, 45.7, 1.1],
    [60.9, 1.1, 58.7, 0.0],
    [59.8, 1.1, 58.7, 0.0],
    [100.0, 0.0, 100.0, 0.0],
    [100.0, 0.0, 100.0, 0.0],
    [100.0, 0.0, 100.0, 0.0],
    [100.0, 0.0, 100.0, 0.0],
    [100.0, 0.0, 100.0, 0.0],
    [100.0, 0.0, 100.0, 0.0],
    [60.9, 1.1, 59.8, 0.0],
    [60.9, 1.1, 59.8, 0.0],
    [43.5, 1.1, 44.6, 1.1],
    [43.5, 1.1, 44.6, 1.1],
    [18.5, 0.0, 22.8, 0.0],
    [18.5, 0.0, 22.8, 0.0],
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
  ],
};
