import type { SyntheticEvent } from "react";

// Spread on a product photo (<img {...fadeIn} />): it stays hidden on its
// plate until it has loaded, then fades in (motion.css), so a slow photo
// never pops in half drawn. One already in the browser's cache fades in on
// the next frame. Marked from script only, so without it photos just show.
function mark(img: HTMLImageElement | null) {
  if (!img || img.dataset.fade !== undefined) return;
  img.dataset.fade = "";
  if (img.complete) requestAnimationFrame(() => (img.dataset.loaded = ""));
}
function done(e: SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.dataset.loaded = "";
}
export const fadeIn = { ref: mark, onLoad: done, onError: done };
