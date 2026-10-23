"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import irisThird from "@/assets/baba/iris-third.webp";
import third from "@/assets/baba/third.webp";
import thirdMask from "@/assets/baba/third-mask.png";
import { hasBabaEyes } from "@/lib/themes";
import { useShopTheme } from "@/lib/useShopTheme";
import { aim, cardFor, eyeLoop, Gaze, SEE_EVENT } from "./gaze";
import { askTilt, readTilt, startTilt } from "./tilt";

type Pick = { href: string; name: string };

// The third eye, beside the category title. It watches the pointer (or a
// finger, or the phone's tilt) like the two in the header; tap it and it
// rolls, then "sees" something on the shelf, which is lit up and scrolled
// into view. It tells the header as it goes (SEE_EVENT), so all three eyes
// roll together and then look at the pick. On phones it floats as a small
// eye symbol in the thumb's corner, above the cart jar.
export default function ThirdEye({ products }: { products: Pick[] }) {
  const theme = useShopTheme();
  const eye = useRef<HTMLButtonElement>(null);
  const [seeing, setSeeing] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const last = useRef<string | null>(null);
  const on = hasBabaEyes(theme) && products.length > 0;

  useEffect(() => {
    const el = eye.current;
    if (!on || !el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gaze = new Gaze({ micro: !still });
    let px = window.innerWidth / 2;
    let py = window.innerHeight;
    let inputAt = 0;
    let fixOn: HTMLElement | null = null;
    let fixUntil = 0;
    let wake = () => {}; // set once the loop is running
    let changed = false;
    // measured now and then, not every frame; styles written only on change
    let r = el.getBoundingClientRect();
    let rectAt = -Infinity;
    const written = new Map<string, string>();
    const put = (key: string, value: string) => {
      if (written.get(key) === value) return;
      written.set(key, value);
      el.style.setProperty(key, value);
      changed = true;
    };
    const onScroll = () => {
      rectAt = -Infinity;
      wake();
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      inputAt = performance.now();
      wake();
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      px = t.clientX;
      py = t.clientY;
      inputAt = performance.now();
      wake();
    };
    // once it has chosen, it looks at what it picked
    const onSee = (e: Event) => {
      const d = (e as CustomEvent<{ phase: string; href?: string }>).detail;
      if (d.phase !== "pick" || !d.href) return;
      fixOn = cardFor(d.href);
      fixUntil = performance.now() + 2600;
      wake();
    };
    const tick = (now: number) => {
      changed = false;
      if (now - rectAt > 300) {
        r = el.getBoundingClientRect();
        rectAt = now;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // the pick, else the pointer or finger, else (on a phone left alone)
      // the tilt, else wherever the pointer was last
      const tilt = now - inputAt > 1500 ? readTilt() : null;
      let want = tilt ?? aim(cx, cy, px, py, 40);
      if (fixOn && now < fixUntil) {
        const f = fixOn.getBoundingClientRect();
        want = aim(cx, cy, f.left + f.width / 2, f.top + f.height / 2, 40);
      }
      const g = gaze.step(now, want);
      put("--ix", `${(g.x * 0.18 * r.width).toFixed(1)}px`);
      put("--iy", `${(g.y * 0.26 * r.height).toFixed(1)}px`);
      put("--fx", (1 - 0.06 * g.x * g.x).toFixed(2));
      put("--fy", (1 - 0.05 * g.y * g.y).toFixed(2));
      return changed;
    };
    const opts = { passive: true } as const;
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("pointerdown", onMove, opts);
    window.addEventListener("touchstart", onTouch, opts);
    window.addEventListener("touchmove", onTouch, opts);
    window.addEventListener(SEE_EVENT, onSee);
    window.addEventListener("scroll", onScroll, opts);
    window.addEventListener("resize", onScroll, opts);
    startTilt();
    const loop = eyeLoop(tick);
    wake = loop.wake;
    return () => {
      loop.stop();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener(SEE_EVENT, onSee);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [on]);

  if (!on) return null;

  function see() {
    if (seeing) return;
    const pool = products.length > 1 ? products.filter((p) => p.href !== last.current) : products;
    const p = pool[Math.floor(Math.random() * pool.length)];
    last.current = p.href;
    setPick(null);
    setSeeing(true);
    askTilt();
    const announce = (detail: { phase: string; href?: string }) =>
      window.dispatchEvent(new CustomEvent(SEE_EVENT, { detail }));
    announce({ phase: "roll" });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(
      () => {
        setSeeing(false);
        setPick(p);
        document.querySelectorAll(".pc[data-seen]").forEach((c) => c.removeAttribute("data-seen"));
        const card = cardFor(p.href);
        if (card) {
          card.dataset.seen = "true";
          card.scrollIntoView({ behavior: still ? "instant" : "smooth", block: "center" });
        }
        announce({ phase: "pick", href: p.href });
      },
      still ? 0 : 1100,
    );
  }

  return (
    <div className="bb-third" data-seeing={seeing} data-picked={!!pick}>
      <button
        ref={eye}
        type="button"
        className="bb-third-btn"
        onClick={see}
        aria-label="Ask the third eye to pick something"
        style={{ "--mask": `url(${thirdMask.src})`, "--iris": `url(${irisThird.src})` } as React.CSSProperties}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={third.src} alt="" aria-hidden="true" />
        <span className="bb-third-white">
          <span className="bb-iris" />
        </span>
        {/* on phones the eye shrinks to this symbol, docked above the jar */}
        <svg className="bb-third-sym" viewBox="0 0 48 48" aria-hidden="true">
          <path className="bb-sym-rays" d="M24 5v5M13 8.5l2.5 4M35 8.5l-2.5 4" />
          <clipPath id="bb-sym-clip">
            <path d="M5 27Q24 9 43 27Q24 45 5 27Z" />
          </clipPath>
          <path className="bb-sym-white" d="M5 27Q24 9 43 27Q24 45 5 27Z" />
          <g clipPath="url(#bb-sym-clip)">
            <g className="bb-sym-iris">
              <circle cx="24" cy="27" r="7.5" />
              <circle className="bb-sym-pupil" cx="24" cy="27" r="3.2" />
            </g>
          </g>
          <path className="bb-sym-edge" d="M5 27Q24 9 43 27Q24 45 5 27Z" />
        </svg>
      </button>
      <div className="bb-third-copy" aria-live="polite">
        {pick ? (
          <>
            <p className="bb-third-kicker">The third eye sees</p>
            <Link href={pick.href} className="bb-third-pick">
              {pick.name} →
            </Link>
          </>
        ) : (
          <>
            <p className="bb-third-kicker">{seeing ? "Looking…" : "Can’t choose?"}</p>
            <p className="bb-third-hint">{seeing ? "Hold still." : "Open the third eye."}</p>
          </>
        )}
      </div>
    </div>
  );
}
