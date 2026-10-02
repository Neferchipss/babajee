import type { Vec } from "./gaze";

// On phones there is no pointer to follow, so the eyes can follow the tilt of
// the device instead: tip it left or right and they look that way, tip it
// towards or away from you and they look down or up. The neutral position
// is however the phone is being held, and slowly re-settles, so it reacts to
// tilting rather than to the angle itself. iOS only allows this after a tap
// (askTilt), so there it starts when someone pokes an eye.

let tilt: Vec | null = null;
let base: number | null = null;
let listening = false;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

function onOrient(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  // portrait only: sideways, the axes swap and the browsing is rare
  if (Math.abs(screen.orientation?.angle ?? 0) === 90) return void (tilt = null);
  base = base == null ? e.beta : base + (e.beta - base) * 0.004;
  tilt = { x: clamp(e.gamma / 22), y: clamp((e.beta - base) / 16) };
}

const touchOnly = () => window.matchMedia("(pointer: coarse) and (not (any-pointer: fine))").matches;

type Ask = { requestPermission?: () => Promise<PermissionState> };
const needsAsking = () =>
  typeof (window.DeviceOrientationEvent as unknown as Ask | undefined)?.requestPermission === "function";

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("deviceorientation", onOrient, { passive: true });
}

// Start following tilt where no permission is needed (Android).
export function startTilt() {
  if (typeof DeviceOrientationEvent !== "undefined" && touchOnly() && !needsAsking()) listen();
}

// Call from a tap: asks iOS for the motion sensors, once.
export function askTilt() {
  if (listening || !touchOnly() || !needsAsking()) return;
  (DeviceOrientationEvent as unknown as Required<Ask>)
    .requestPermission()
    .then((p) => p === "granted" && listen())
    .catch(() => {});
}

export const readTilt = () => tilt;
