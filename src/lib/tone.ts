const TONES = [
  "var(--color-rasta-red)",
  "var(--color-rasta-gold)",
  "var(--color-rasta-green)",
] as const;

export function toneAt(index: number) {
  return TONES[index % TONES.length];
}
