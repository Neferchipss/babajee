// The five shop themes. They change layout and styling only; the catalogue,
// prices, logo, labels and flows are the same in every one.
export const THEMES = [
  { id: "sunshine", label: "Sunshine" },
  { id: "fieldnotes", label: "Field notes" },
  { id: "trailhead", label: "Trailhead" },
  { id: "refined", label: "Refined" },
  { id: "groove", label: "Groove" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "refined";
export const THEME_STORAGE_KEY = "bj-theme";
export const THEME_EVENT = "bj-theme-change";

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
