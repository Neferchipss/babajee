"use client";

import { useEffect } from "react";
import { hasBabaEyes } from "@/lib/themes";
import { useShopTheme } from "@/lib/useShopTheme";
import { FOCUS_EVENT } from "./gaze";
import "./shelf-reader.css";

// Baba reads the shelf with you. On a phone, the card crossing a reading
// line a little above the middle of the screen is the one he is on; with a
// mouse, it is the card under the pointer. That card is lit (data-focus) and
// the eyes in the band follow it.

// the bottom of whatever bar is stuck to the top of the screen: the header,
// or on phones the shelf's own title bar
function barBottom() {
  const bars = [...document.querySelectorAll<HTMLElement>(".hdr, .cp-hero")]
    .map((x) => x.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.top <= 1 && r.bottom > 0);
  return Math.max(0, ...bars.map((r) => r.bottom));
}

export default function ShelfReader() {
  const theme = useShopTheme();
  const on = hasBabaEyes(theme);

  useEffect(() => {
    if (!on) return;
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let focus: HTMLElement | null = null;
    let touchX = window.innerWidth * 0.3;
    let frame = 0;

    const setFocus = (card: HTMLElement | null) => {
      if (card === focus) return;
      focus?.removeAttribute("data-focus");
      focus = card;
      card?.setAttribute("data-focus", "true");
      window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { el: card } }));
    };

    // the card nearest the reading line; between two in a row, the one on
    // the side the thumb was last on. A little stickiness stops it flicking.
    const read = () => {
      frame = 0;
      // measured in the part of the screen the sticky band and header leave
      const top = barBottom();
      const line = top + (window.innerHeight - top) * 0.4;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      let focusScore = Infinity;
      for (const card of document.querySelectorAll<HTMLElement>(".cp-grid > .pc")) {
        const r = card.getBoundingClientRect();
        if (r.bottom < top || r.top > window.innerHeight) continue;
        const score = Math.abs(r.top + r.height / 2 - line) + 0.35 * Math.abs(r.left + r.width / 2 - touchX);
        if (card === focus) focusScore = score;
        if (score < bestScore) {
          bestScore = score;
          best = card;
        }
      }
      setFocus(best && focusScore - bestScore > 24 ? best : focus && focusScore < Infinity ? focus : best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) touchX = t.clientX;
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      setFocus((e.target as HTMLElement).closest<HTMLElement>(".cp-grid > .pc"));
    };

    const opts = { passive: true } as const;
    if (hover) {
      window.addEventListener("pointerover", onOver, opts);
    } else {
      window.addEventListener("scroll", onScroll, opts);
      window.addEventListener("resize", onScroll, opts);
      window.addEventListener("touchstart", onTouch, opts);
      read();
    }
    return () => {
      cancelAnimationFrame(frame);
      focus?.removeAttribute("data-focus");
      window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { el: null } }));
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("touchstart", onTouch);
    };
  }, [on]);

  return null;
}
