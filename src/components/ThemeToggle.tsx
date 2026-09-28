"use client";

import { THEMES, THEME_EVENT, THEME_STORAGE_KEY, type ThemeId } from "@/lib/themes";
import { useShopTheme } from "@/lib/useShopTheme";

export default function ThemeToggle() {
  const theme = useShopTheme();

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
