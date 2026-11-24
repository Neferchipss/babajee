// Putting the shop's colours (shop-colours.ts) on the page: a <style
// id="bj-colours"> with the palette's CSS, the phone's browser bar in the
// header colour, and a copy kept in this browser so the next page load
// applies it before the first paint (coloursBootScript, in the layout).
// Legacy removes the style and the copy. The preview passes keep: false so
// a palette being tried never becomes this browser's copy.
import { paletteCss, themeBar, type Mode, type ShopColours } from "./shop-colours.ts";

export const COLOURS_KEY = "bj-colours";
const STYLE_ID = "bj-colours";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ApplyEnv = {
  setStyle: (css: string | null) => void;
  store: Store;
  mode: () => Mode;
  setBar: (hex: string) => void;
};

const browserEnv = (): ApplyEnv => ({
  setStyle: (css) => {
    let el = document.getElementById(STYLE_ID);
    if (css === null) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
  },
  store: localStorage,
  mode: () => (document.documentElement.dataset.mode === "light" ? "light" : "dark"),
  setBar: (hex) => {
    if (location.pathname.includes("/admin")) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", hex));
  },
});

export function applyColours(c: ShopColours | null, opts: { keep?: boolean } = {}, env: ApplyEnv = browserEnv()) {
  const css = paletteCss(c);
  env.setStyle(css || null);
  env.setBar(themeBar(c, env.mode()));
  if (opts.keep === false) return;
  try {
    if (css) env.store.setItem(COLOURS_KEY, JSON.stringify({ css, bar: { light: themeBar(c, "light"), dark: themeBar(c, "dark") } }));
    else env.store.removeItem(COLOURS_KEY);
  } catch {}
}

// the header colour this browser last saw for a mode, for the browser bar
export function cachedBar(mode: Mode, store: Store = localStorage): string | null {
  try {
    const c = JSON.parse(store.getItem(COLOURS_KEY) ?? "null") as { bar?: Record<Mode, string> } | null;
    return c?.bar?.[mode] ?? null;
  } catch {
    return null;
  }
}

// before the first paint: the last palette seen, and the bar to match
// (runs after the mode boot script, so data-mode is already set)
export const coloursBootScript = `var bc=JSON.parse(localStorage.getItem(${JSON.stringify(COLOURS_KEY)})||"null");if(bc&&bc.css){var bs=document.createElement("style");bs.id=${JSON.stringify(STYLE_ID)};bs.textContent=bc.css;document.head.appendChild(bs);var bb=bc.bar&&bc.bar[document.documentElement.dataset.mode];if(bb&&location.pathname.indexOf("/admin")<0)document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",bb)});}`;
