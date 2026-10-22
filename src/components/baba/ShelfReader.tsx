"use client";

import { useEffect, useState } from "react";
import { hasBabaEyes } from "@/lib/themes";
import { useShopTheme } from "@/lib/useShopTheme";
import { FOCUS_EVENT, REACT_EVENT } from "./gaze";
import "./shelf-reader.css";

// Baba reads the shelf with you. On a phone, the card crossing a reading
// line a little above the middle of the screen is the one he is on; with a
// mouse, it is the card under the pointer. That card is lit (data-focus),
// the eyes in the band follow it, and if you stay on it a moment he says
// something about it in a bubble under the band.
const LINGER_MS = 1400;
const SAY_MS = 3400;
const QUIET_MS = 5000; // at least this long between remarks

// {n} is the product's name, {c} the category
const FIRST = [
  "Ah, {n}. You have taste.",
  "Everyone starts with {n}. Not everyone stops.",
  "{n}? Good pick for a slow evening.",
  "That one has been on my shelf longer than me.",
  "Tap it. I won't tell anyone.",
  "The {c} crowd loves this one.",
  "My third eye twitched. That usually means yes.",
  "Careful, that's my favourite.",
  "Bold. I respect it.",
  "Hm. {n}. Honest, no nonsense.",
  "Steady hands for {n}.",
  "I'd look twice at that too.",
  "{n}. A quiet classic.",
  "You and {n}. I can see it.",
];
const AGAIN = [
  "Back to {n} again?",
  "You keep coming back to this one.",
  "{n} again. Just get it.",
  "Still thinking about {n}? So am I.",
];

const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

const SEEN_KEY = "bj-baba-seen";
function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {}
}

// the bottom of whatever bar is stuck to the top of the screen: the header,
// or on phones the shelf's own title bar
function barBottom() {
  const bars = [...document.querySelectorAll<HTMLElement>(".hdr, .cp-hero")]
    .map((x) => x.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.top <= 1 && r.bottom > 0);
  return Math.max(0, ...bars.map((r) => r.bottom));
}

function remark(card: HTMLElement, seen: Set<string>, category: string) {
  const href = card.querySelector("a")?.getAttribute("href") ?? "";
  const name = card.querySelector(".pc-name")?.textContent?.trim() ?? "";
  if (!name) return null;
  const again = seen.has(href);
  const lines = again ? AGAIN : FIRST;
  const line = lines[(hash(href) + (again ? 7 : 0)) % lines.length];
  seen.add(href);
  return line.replace("{n}", name).replace("{c}", category.toLowerCase());
}

export default function ShelfReader({ category }: { category: string }) {
  const theme = useShopTheme();
  const on = hasBabaEyes(theme);
  const [say, setSay] = useState<{ text: string; id: number; top?: number } | null>(null);

  useEffect(() => {
    if (!on) return;
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const seen = readSeen();
    let focus: HTMLElement | null = null;
    let saidOn: HTMLElement | null = null;
    let lastSaid = -Infinity;
    let touchX = window.innerWidth * 0.3;
    let frame = 0;
    let linger = 0;
    let quiet = 0;
    let id = 0;

    const speak = () => {
      const now = performance.now();
      if (!focus || focus === saidOn || document.documentElement.dataset.sheet) return;
      if (now - lastSaid < QUIET_MS) {
        linger = window.setTimeout(speak, QUIET_MS - (now - lastSaid));
        return;
      }
      const text = remark(focus, seen, category);
      if (!text) return;
      saveSeen(seen);
      saidOn = focus;
      lastSaid = now;
      // Baba's band is off the page, so the bubble sits just under whatever
      // bar is at the top (the header, or the shelf's own title bar on phones)
      const top = barBottom() + 12;
      setSay({ text, id: ++id, top });
      window.dispatchEvent(new CustomEvent(REACT_EVENT, { detail: { el: focus } }));
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => setSay(null), SAY_MS);
    };

    const setFocus = (card: HTMLElement | null) => {
      if (card === focus) return;
      focus?.removeAttribute("data-focus");
      focus = card;
      card?.setAttribute("data-focus", "true");
      window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { el: card } }));
      window.clearTimeout(linger);
      if (card) linger = window.setTimeout(speak, LINGER_MS);
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
      // a scroll puts a remark away
      if (saidOn) {
        saidOn = null;
        setSay(null);
      }
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
      window.clearTimeout(linger);
      window.clearTimeout(quiet);
      focus?.removeAttribute("data-focus");
      window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { el: null } }));
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("touchstart", onTouch);
    };
  }, [on, category]);

  if (!on) return null;
  return (
    <p
      className="bb-say"
      role="status"
      aria-live="polite"
      data-on={say !== null}
      data-under={say?.top !== undefined ? "hdr" : undefined}
      style={say?.top !== undefined ? { top: say.top } : undefined}
    >
      <span key={say?.id}>{say?.text}</span>
    </p>
  );
}
