import { CATEGORIES } from "./catalog-data";

export const TONES = [
  "var(--color-rasta-red)",
  "var(--color-rasta-gold)",
  "var(--color-rasta-green)",
] as const;

export function toneAt(index: number) {
  return TONES[index % TONES.length];
}

export function categoryTone(slug: string) {
  return toneAt(Math.max(0, CATEGORIES.findIndex((c) => c.slug === slug)));
}
