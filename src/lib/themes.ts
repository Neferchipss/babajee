// Shop themes share the catalogue, prices, logo and purchase flows.
export const THEMES = [
  { id: "refined", label: "Refined" },
  { id: "daydream", label: "Daydream" },
  { id: "baba", label: "Baba" },
  { id: "baba-poster", label: "Night: Poster" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "refined";
export const THEME_STORAGE_KEY = "bj-theme";
export const THEME_EVENT = "bj-theme-change";

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

// Baba and Night: Poster (baba-poster) both start with "baba"; they share the
// character's eyes (header band + third eye), and the CSS matches the prefix.
export const hasBabaEyes = (t: ThemeId) => t.startsWith("baba");
