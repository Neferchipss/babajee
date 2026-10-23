"use client";

import Link from "next/link";
import SceneLink from "@/components/SceneLink";
import { useEffect, useRef, useState } from "react";
import { aim, Gaze } from "./baba/gaze";
import { askTilt, readTilt, startTilt } from "./baba/tilt";
import "./lost-page.css";

type Cat = { slug: string; name: string };

// The 404: "4 0 4" where the 0 is Baba's third eye. It follows the pointer
// (or finger, or the phone's tilt), blinks now and then, flinches when it is
// poked and gets crosser each time, and, asked to, rolls and picks a
// category to go to instead.
const POKES = [
  "Baba looked on every shelf. This page isn't on any of them.",
  "Ow. Still not here.",
  "Poking me won't make it appear.",
  "Fine. I'll pick something for you.",
];

export default function LostPage({ categories }: { categories: Cat[] }) {
  const eye = useRef<HTMLButtonElement>(null);
  const [pokes, setPokes] = useState(0);
  const [blink, setBlink] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [pick, setPick] = useState<Cat | null>(null);
  const rollAt = useRef(-Infinity);

  useEffect(() => {
    const el = eye.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gaze = new Gaze({ micro: !still });
    let px = window.innerWidth / 2;
    let py = window.innerHeight * 0.8;
    let inputAt = 0;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      inputAt = performance.now();
    };
    const tick = (now: number) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let want = aim(cx, cy, px, py, 120);
      const tilt = now - inputAt > 1500 ? readTilt() : null;
      if (tilt) want = tilt;
      if (now - rollAt.current < 1100) {
        const a = ((now - rollAt.current) / 1100) * Math.PI * 2;
        want = { x: Math.cos(a) * 0.95, y: -Math.sin(a) * 0.95 };
      }
      const g = gaze.step(now, want);
      el.style.setProperty("--ix", `${(g.x * 0.26 * r.width).toFixed(1)}px`);
      el.style.setProperty("--iy", `${(g.y * 0.16 * r.height).toFixed(1)}px`);
      frame = requestAnimationFrame(tick);
    };
    const blinks = () => {
      if (!still) setBlink((b) => b + 1);
      timer = window.setTimeout(blinks, 2500 + Math.random() * 4000);
    };
    let timer = window.setTimeout(blinks, 1800);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    startTilt();
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);

  function choose() {
    if (rolling || categories.length === 0) return;
    setRolling(true);
    setPick(null);
    rollAt.current = performance.now();
    const pool = pick && categories.length > 1 ? categories.filter((c) => c.slug !== pick.slug) : categories;
    window.setTimeout(() => {
      setRolling(false);
      setPick(pool[Math.floor(Math.random() * pool.length)]);
      setBlink((b) => b + 1);
    }, 1150);
  }

  function poke() {
    askTilt();
    setBlink((b) => b + 1);
    const n = pokes + 1;
    setPokes(n);
    try {
      navigator.vibrate?.(n >= 3 ? [20, 40, 20] : 12);
    } catch {}
    if (n >= POKES.length - 1) choose();
  }

  const mood = Math.min(pokes, 3);
  return (
    <section className="lost" aria-labelledby="lost-title">
      <div className="lost-smoke" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} style={{ "--k": i } as React.CSSProperties} />
        ))}
      </div>

      <h1 id="lost-title" className="lost-code">
        <span aria-hidden="true">4</span>
        <button
          ref={eye}
          type="button"
          className="lost-eye"
          data-mood={mood}
          data-rolling={rolling}
          onClick={poke}
          aria-label="Poke Baba's third eye"
        >
          <svg key={pokes} className="lost-svg" viewBox="0 0 120 84" aria-hidden="true">
            <defs>
              <clipPath id="lost-eye-clip">
                <path d="M6 42Q60 -8 114 42Q60 92 6 42Z" />
              </clipPath>
            </defs>
            <path className="lost-white" d="M6 42Q60 -8 114 42Q60 92 6 42Z" />
            <g clipPath="url(#lost-eye-clip)">
              <g className="lost-iris">
                <circle cx="60" cy="42" r="19" />
                <circle className="lost-ring" cx="60" cy="42" r="12" />
                <circle className="lost-pupil" cx="60" cy="42" r="7" />
                <circle className="lost-glint" cx="66" cy="35" r="3" />
              </g>
              <rect key={blink} className="lost-lid" x="0" y="-90" width="120" height="90" />
            </g>
            <path className="lost-edge" d="M6 42Q60 -8 114 42Q60 92 6 42Z" />
          </svg>
          <span className="sr-only">0</span>
        </button>
        <span aria-hidden="true">4</span>
      </h1>

      <p className="lost-line" aria-live="polite">
        {rolling ? "Looking…" : POKES[Math.min(pokes, POKES.length - 1)]}
      </p>

      {pick && !rolling && (
        <p className="lost-pick">
          <span>The eye sees</span>
          <Link href={`/shop/${pick.slug}`}>{pick.name} &rarr;</Link>
        </p>
      )}

      <div className="lost-actions">
        <SceneLink href="/shop" className="lost-btn lost-btn--main">
          Back to the shop
        </SceneLink>
        <button type="button" className="lost-btn" onClick={choose} disabled={rolling}>
          {pick ? "Pick again" : "Let the eye choose"}
        </button>
      </div>
      <p className="lost-hint" aria-hidden="true">
        psst, poke the eye
      </p>
    </section>
  );
}
