"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_EVENT, isTheme, type ThemeId } from "./themes";

// The theme lives on <html data-theme>, set before paint by the inline script
// in the root layout. This reads it and re-renders when the toggle changes it.
function read(): ThemeId {
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : DEFAULT_THEME;
}
function subscribe(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

export function useShopTheme(): ThemeId {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_THEME);
}

// Media in public/ is referenced by plain URL, so it needs the base path the
// GitHub Pages preview is served under.
export const publicAsset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
