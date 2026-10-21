// Shop themes share the catalogue, prices, logo and purchase flows.
// `shown: false` parks a theme: its CSS stays, but nobody can pick it and a
// visitor who had it saved lands on the default instead.
export const THEMES = [
  { id: "refined", label: "Refined", shown: false },
  { id: "daydream", label: "Daydream", shown: false },
  { id: "baba", label: "Baba", shown: false },
  { id: "baba-poster", label: "Night: Poster", shown: true },
] as const;

export const SHOWN_THEMES = THEMES.filter((t) => t.shown);

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "baba-poster";
export const THEME_STORAGE_KEY = "bj-theme";
export const THEME_EVENT = "bj-theme-change";

export const isTheme = (v: unknown): v is ThemeId => SHOWN_THEMES.some((t) => t.id === v);

// Baba and Night: Poster (baba-poster) both start with "baba"; they share the
// character's eyes (header band + third eye), and the CSS matches the prefix.
export const hasBabaEyes = (t: ThemeId) => t.startsWith("baba");
