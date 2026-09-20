"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_EVENT,
  THEME_STORAGE_KEY,
  isTheme,
  type ThemeId,
} from "@/lib/themes";

// The theme lives on <html data-theme>, set before paint by the inline script
// in the root layout, so the page never flashes the wrong look.
function read(): ThemeId {
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : DEFAULT_THEME;
}
function subscribe(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => DEFAULT_THEME);

  function choose(id: ThemeId) {
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Shop theme">
      <span className="theme-toggle-label" aria-hidden="true">
        Theme
      </span>
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => choose(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
