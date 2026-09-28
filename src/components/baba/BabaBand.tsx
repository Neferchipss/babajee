"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import band from "@/assets/baba/band.webp";
import irisLeft from "@/assets/baba/iris-left.webp";
import irisRight from "@/assets/baba/iris-right.webp";
import leftMask from "@/assets/baba/eye-left-mask.png";
import rightMask from "@/assets/baba/eye-right-mask.png";
import { hasBabaEyes } from "@/lib/themes";
import { publicAsset, useShopTheme } from "@/lib/useShopTheme";
import { BLINK } from "./blink";

// Where the empty eye whites sit in the band, in % of it. Measured from the
// blink clip's open frame, which the still is an upscale of, so the still and
// the clip line up exactly.
const EYES = [
  { side: "left", mask: leftMask.src, iris: irisLeft.src, left: 12.295, top: 23.5, width: 23.77, height: 46 },
  { side: "right", mask: rightMask.src, iris: irisRight.src, left: 61.944, top: 23.5, width: 23.77, height: 46 },
] as const;

// The Baba header on category pages: the character's eyes across the top of
// the page. The artwork has empty eye whites; the irises (generated in the
// character's inked style, one per eye) are a separate layer
// that looks at the pointer (or the last touch). Every few seconds the face
// blinks: a generated clip of the lids plays over the still, and the irises
// are clipped frame by frame to the lids measured from that same clip.
export default function BabaBand() {
  const theme = useShopTheme();
  const path = usePathname().replace(/\/$/, "");
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const isCategory = /^\/shop\/[^/]+$/.test(path) && path !== "/shop/search";
  const on = hasBabaEyes(theme) && isCategory;

  useEffect(() => {
    const root = stage.current;
    const v = video.current;
    if (!on || !root || !v) return;
    const eyes = Array.from(root.querySelectorAll<HTMLElement>(".bb-eye"));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let px = window.innerWidth / 2;
    let py = window.innerHeight;
    let lastInput = 0;
    let frame = 0;
    let blinking = false;
    let timer = 0;
    const cur = eyes.map(() => ({ x: 0, y: 0 }));

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      lastInput = performance.now();
    };
    // the irises swell a little while you look at something on the shelf
    const onOver = (e: PointerEvent) => {
      const hot = !!(e.target as HTMLElement).closest(".pc, .bb-third");
      root.style.setProperty("--dil", hot ? "1.1" : "1");
    };

    const setLids = (i: number) => {
      const f = BLINK.frames[Math.min(i, BLINK.frames.length - 1)];
      eyes.forEach((eye, k) => {
        const [top, bottom] = k === 0 ? [f[0], f[1]] : [f[2], f[3]];
        eye.style.setProperty("--lid-top", `${top}%`);
        eye.style.setProperty("--lid-bottom", `${bottom}%`);
      });
    };

    // however a blink ends (finished, interrupted, stalled), the eyes open
    let safety = 0;
    const endBlink = () => {
      clearTimeout(safety);
      blinking = false;
      delete root.dataset.blinking;
      setLids(0);
    };
    const blink = () => {
      if (blinking || !BLINK.frames.length) return;
      blinking = true;
      root.dataset.blinking = "true";
      v.currentTime = 0;
      v.play().catch(endBlink);
      safety = window.setTimeout(endBlink, 2500);
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        blink();
        schedule();
      }, 2600 + Math.random() * 5200);
    };
    v.onended = endBlink;

    const tick = (now: number) => {
      // idle: a slow wander so the face never goes dead
      let tx = px;
      let ty = py;
      if (now - lastInput > 4000) {
        tx = window.innerWidth * (0.5 + Math.sin(now / 2600) * 0.4);
        ty = window.innerHeight * (0.6 + Math.cos(now / 3400) * 0.3);
      }
      eyes.forEach((eye, k) => {
        const r = eye.getBoundingClientRect();
        const dx = tx - (r.left + r.width / 2);
        const dy = ty - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, len / 360);
        const gx = (dx / len) * reach * 0.3 * r.width;
        const gy = (dy / len) * reach * 0.24 * r.height;
        cur[k].x += (gx - cur[k].x) * 0.18;
        cur[k].y += (gy - cur[k].y) * 0.18;
        eye.style.setProperty("--ix", `${cur[k].x.toFixed(1)}px`);
        eye.style.setProperty("--iy", `${cur[k].y.toFixed(1)}px`);
      });
      if (blinking) setLids(Math.round(v.currentTime * BLINK.fps));
      frame = requestAnimationFrame(tick);
    };

    const poke = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".bb-eye")) blink();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    root.addEventListener("click", poke);
    frame = requestAnimationFrame(tick);
    if (!still) schedule();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(safety);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("pointerover", onOver);
      root.removeEventListener("click", poke);
    };
  }, [on]);

  if (!on) return null;
  return (
    <div className="bb-band">
      <div ref={stage} className="bb-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={band.src} alt="" className="bb-art" aria-hidden="true" />
        <video
          ref={video}
          className="bb-blink"
          src={publicAsset("/baba/blink.mp4")}
          muted
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload"
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        />
        {EYES.map((e) => (
          <button
            key={e.side}
            type="button"
            className={`bb-eye bb-eye--${e.side}`}
            aria-label="Poke the eye"
            style={
              {
                left: `${e.left}%`,
                top: `${e.top}%`,
                width: `${e.width}%`,
                height: `${e.height}%`,
                "--mask": `url(${e.mask})`,
                "--iris": `url(${e.iris})`,
              } as React.CSSProperties
            }
          >
            <span className="bb-iris" />
          </button>
        ))}
      </div>
    </div>
  );
}
