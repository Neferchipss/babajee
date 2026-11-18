// A short vibration, where the phone supports it (Android Chrome); a quiet
// no-op everywhere else, including iPhones and browsers that refuse it.
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
