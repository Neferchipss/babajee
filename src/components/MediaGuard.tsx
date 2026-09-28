"use client";

import { useEffect } from "react";

const MEDIA = "img, picture, video, canvas";

const hasBgImage = (el: Element, pseudo?: string) =>
  getComputedStyle(el, pseudo).backgroundImage.includes("url(");

// True for media elements, and for the element under the pointer when it is
// painted with a CSS image itself (the themes' plates, swirls and hair art).
// Ancestors are not checked, or text sitting on a textured page would lose
// its menu too.
function isMedia(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest(MEDIA)) return true;
  return hasBgImage(target) || hasBgImage(target, "::before") || hasBgImage(target, "::after");
}

// Deters casual saving of the site's photos and clips: no "Save image/video
// as" menu, no dragging them out, no long-press save on phones, no Ctrl+S.
// Links and text keep their normal right-click menu. This is a deterrent
// only: anything shown in a browser can still be screenshotted or pulled
// from the network tab.
export default function MediaGuard() {
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (isMedia(e.target)) e.preventDefault();
    };
    const onDrag = (e: DragEvent) => {
      if (isMedia(e.target)) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") e.preventDefault();
    };
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("dragstart", onDrag);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("dragstart", onDrag);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
