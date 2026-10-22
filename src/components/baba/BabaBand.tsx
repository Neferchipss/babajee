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
import { aim, FOCUS_EVENT, Gaze, REACT_EVENT, SEE_EVENT, type Vec } from "./gaze";
import { askTilt, readTilt, startTilt } from "./tilt";

// touch screens, where the band hides until you pull down at the top
const PEEK_MEDIA = "(hover: none) and (pointer: coarse)";
const BLINK_EVENT = "bb:blink";

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
// that looks the way the pointer (or a finger, or the phone's tilt) is,
// moving as real eyes do (see gaze.ts). Left alone, they glance around the
// shelf; they follow a scroll, start at a flick of the pointer, do a double
// take when you come back to the tab, and join in when the third eye
// chooses something. Every few seconds the face
// blinks: a generated clip of the lids plays over the still, and the irises
// are clipped frame by frame to the lids measured from that same clip.
export default function BabaBand() {
  const theme = useShopTheme();
  const path = usePathname().replace(/\/$/, "");
  const bandRef = useRef<HTMLDivElement>(null);
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
    let mouseAt = 0; // last mouse or pen movement
    let touching = false;
    let touchAt = 0; // last touch, or when the finger lifted
    let scrollAt = 0;
    let scrollDir = 0;
    let lastScroll = window.scrollY;
    let away = false;
    let frame = 0;
    let blinking = false;
    let again = false;
    let lastBlink = 0;
    let hiddenAt = 0;
    let timer = 0;
    let dil = 1;
    let hot = false;
    let hotSince = 0;
    let swollen = false;
    let speed = 0;
    let lastMove = { x: px, y: py, t: 0 };
    let startleUntil = 0;
    let lastStartle = 0;
    let rollFrom = -Infinity;
    let fixOn: HTMLElement | null = null;
    let fixUntil = 0;
    let glance = { x: px, y: py };
    let glanceAt = 0;
    let lastNow = 0;
    let focusOn: HTMLElement | null = null; // the card the shelf reader is on
    let focusAt = 0;
    let reactUntil = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // touches are followed below
      const now = performance.now();
      px = e.clientX;
      py = e.clientY;
      mouseAt = now;
      away = false;
      // a sudden flick of the pointer startles the face
      const dt = now - lastMove.t;
      if (dt > 0 && dt < 100) {
        const inst = Math.hypot(px - lastMove.x, py - lastMove.y) / dt;
        speed += (inst - speed) * 0.35;
        if (!still && speed > 4.5 && now - lastStartle > 3000) {
          lastStartle = now;
          startleUntil = now + 380;
          if (Math.random() < 0.5) window.setTimeout(blink, 140);
        }
      } else {
        speed = 0;
      }
      lastMove = { x: px, y: py, t: now };
    };
    // on a touch screen the eyes follow the finger while it is down
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      px = t.clientX;
      py = t.clientY;
      touching = true;
      touchAt = performance.now();
      away = false;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length) return;
      touching = false;
      touchAt = performance.now();
    };
    // scrolling: the eyes look the way the shelf is moving
    const onScroll = () => {
      const y = window.scrollY;
      if (y !== lastScroll) scrollDir = Math.sign(y - lastScroll);
      lastScroll = y;
      scrollAt = performance.now();
    };
    // the pointer left the window: look around instead of staring at the edge
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget && e.pointerType !== "touch") away = true;
    };
    // the irises swell a little while you look at something on the shelf
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const over = !!(e.target as HTMLElement).closest(".pc, .bb-third");
      if (over !== hot) {
        hot = over;
        hotSince = performance.now();
      }
    };
    // back on the tab after a while: a double take
    const onVisible = () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (!still && hiddenAt && performance.now() - hiddenAt > 2000) {
        again = true;
        window.setTimeout(blink, 250);
      }
    };
    // the third eye is choosing: the face rolls its eyes with it, then all
    // three look at what it picked
    const onSee = (e: Event) => {
      const d = (e as CustomEvent<{ phase: string; href?: string }>).detail;
      const now = performance.now();
      if (d.phase === "roll" && !still) rollFrom = now;
      if (d.phase === "pick" && d.href) {
        fixOn = document.querySelector<HTMLElement>(`.pc:has(a[href="${d.href}"])`);
        fixUntil = now + 2600;
      }
    };

    // the shelf reader moved to another card; Baba reads along
    const onFocus = (e: Event) => {
      focusOn = (e as CustomEvent<{ el: HTMLElement | null }>).detail.el;
      focusAt = performance.now();
    };
    // Baba says something about a card: the pupils open wide, sometimes a blink
    const onReact = (e: Event) => {
      const now = performance.now();
      if (still) return;
      reactUntil = now + 1500;
      // only a remark about a card can end in a blink (the pull's wide eyes stay open)
      const about = (e as CustomEvent<{ el: HTMLElement | null }>).detail?.el;
      if (about && Math.random() < 0.5 && now - lastBlink > 1200) window.setTimeout(blink, 900);
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
      if (again) {
        again = false;
        window.setTimeout(blink, 120);
      }
    };
    const blink = () => {
      if (blinking || !BLINK.frames.length) return;
      blinking = true;
      lastBlink = performance.now();
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

    // big glances sometimes come with a blink, as they do in people
    const gaze = new Gaze({
      micro: !still,
      onSaccade: (amp) => {
        if (!still && amp > 0.7 && Math.random() < 0.3 && performance.now() - lastBlink > 1800) blink();
      },
    });

    // idle: glance between things on the shelf, holding each look a while
    const pickGlance = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".pc"))
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.bottom > 0 && r.top < h);
      if (cards.length && Math.random() < 0.65) {
        const r = cards[Math.floor(Math.random() * cards.length)];
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return { x: w * (0.1 + Math.random() * 0.8), y: h * (0.3 + Math.random() * 0.6) };
    };

    // Where to look, most pressing first: a point on screen, or a direction
    // when it comes from the third eye's roll or the phone's tilt.
    const target = (now: number, cx: number, cy: number): { at: Vec } | { dir: Vec } => {
      if (now - rollFrom < 1100) {
        const a = ((now - rollFrom) / 1100) * Math.PI * 2;
        return { dir: { x: Math.cos(a) * 0.9, y: -Math.sin(a) * 0.9 } };
      }
      if (fixOn && now < fixUntil) {
        const r = fixOn.getBoundingClientRect();
        return { at: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
      }
      const mouse = !away && now - mouseAt < 3500;
      const scrolling = !still && now - scrollAt < 600;
      // reading the shelf: while it scrolls, the eyes ride along with the
      // card under the reading line instead of the finger pushing it
      const reading = focusOn?.isConnected ? focusOn.getBoundingClientRect() : null;
      const onCard = reading && { at: { x: reading.left + reading.width / 2, y: reading.top + reading.height / 2 } };
      if (onCard && now - scrollAt < 600) return onCard;
      if (touching || now - touchAt < 1500 || (mouse && !scrolling)) return { at: { x: px, y: py } };
      if (scrolling) {
        return { at: { x: cx + (px - cx) * 0.3, y: scrollDir > 0 ? cy + window.innerHeight : -window.innerHeight } };
      }
      // settled on a card: keep looking at it for a while before wandering
      if (onCard && now - focusAt < 4500) return onCard;
      const tilt = readTilt();
      if (tilt) return { dir: tilt };
      if (still) return { at: { x: window.innerWidth / 2, y: window.innerHeight } };
      if (now >= glanceAt) {
        glance = pickGlance();
        glanceAt = now + 700 + Math.random() * 2200;
      }
      return { at: glance };
    };

    const tick = (now: number) => {
      const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
      lastNow = now;
      // the eyes look the way the target is, from the middle of the face,
      // both turned together; they do not converge on it
      const rects = eyes.map((eye) => eye.getBoundingClientRect());
      const cx = rects.reduce((a, r) => a + r.left + r.width / 2, 0) / rects.length;
      const cy = rects.reduce((a, r) => a + r.top + r.height / 2, 0) / rects.length;
      const t = target(now, cx, cy);
      const g = gaze.step(now, "dir" in t ? t.dir : aim(cx, cy, t.at.x, t.at.y, 40));
      // swell only once the pointer has settled on (or off) the shelf, and
      // ease slowly, so sweeping across the cards does not make them pulse;
      // a startle shrinks them quickly, and they relax back
      if (now - hotSince > (hot ? 180 : 450)) swollen = hot;
      const startled = now < startleUntil;
      const want = startled ? 0.84 : now < reactUntil ? 1.2 : swollen ? 1.1 : 1;
      dil += (want - dil) * (1 - Math.exp(-dt / (startled ? 0.07 : 0.45)));
      eyes.forEach((eye, i) => {
        const r = rects[i];
        eye.style.setProperty("--ix", `${(g.x * 0.3 * r.width).toFixed(1)}px`);
        eye.style.setProperty("--iy", `${(g.y * 0.24 * r.height).toFixed(1)}px`);
        // a turned iris is seen at an angle, so it narrows that way
        eye.style.setProperty("--fx", (1 - 0.06 * g.x * g.x).toFixed(3));
        eye.style.setProperty("--fy", (1 - 0.05 * g.y * g.y).toFixed(3));
        eye.style.setProperty("--dil", dil.toFixed(3));
      });
      if (blinking) setLids(Math.round(v.currentTime * BLINK.fps));
      frame = requestAnimationFrame(tick);
    };

    // poking an eye blinks it, and on an iPhone asks to follow its tilt
    const poke = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".bb-eye")) return;
      blink();
      askTilt();
    };

    const opts = { passive: true } as const;
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("pointerdown", onMove, opts);
    window.addEventListener("pointerover", onOver, opts);
    window.addEventListener("touchstart", onTouch, opts);
    window.addEventListener("touchmove", onTouch, opts);
    window.addEventListener("touchend", onTouchEnd, opts);
    window.addEventListener("touchcancel", onTouchEnd, opts);
    window.addEventListener("scroll", onScroll, opts);
    window.addEventListener(SEE_EVENT, onSee);
    window.addEventListener(FOCUS_EVENT, onFocus);
    window.addEventListener(REACT_EVENT, onReact);
    document.addEventListener("pointerout", onOut, opts);
    document.addEventListener("visibilitychange", onVisible);
    root.addEventListener("click", poke);
    window.addEventListener(BLINK_EVENT, blink);
    startTilt();
    frame = requestAnimationFrame(tick);
    if (!still) schedule();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(safety);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(SEE_EVENT, onSee);
      window.removeEventListener(FOCUS_EVENT, onFocus);
      window.removeEventListener(REACT_EVENT, onReact);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("visibilitychange", onVisible);
      root.removeEventListener("click", poke);
      window.removeEventListener(BLINK_EVENT, blink);
    };
  }, [on]);

  // The band is not on the page. On a touch screen, pull down past the top
  // (where a phone would refresh) and the eyes slide down over the header,
  // having been watching all along; let go far enough and they blink and
  // the page reloads, or short of that they slip back up. With a mouse or
  // trackpad, scrolling up past the top lets them peek out for a moment.
  useEffect(() => {
    const el = bandRef.current;
    if (!on || !el) return;
    const touchScreen = window.matchMedia(PEEK_MEDIA).matches;
    const root = document.documentElement;
    let y0 = 0;
    let pull = 0;
    let armed = false; // the touch started at the top of the page
    let going = false;
    let hide = 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // fully out: the eyes and the brow above them (the art below the eyes
    // stays hidden), under the notch if there is one
    const height = () => {
      const art = el.querySelector<HTMLElement>(".bb-stage")?.offsetHeight ?? 110;
      return art * 0.72 + (parseFloat(getComputedStyle(el).paddingTop) || 0);
    };
    // past fully out, the face leans in closer instead of the band growing
    const show = (px: number, ease: boolean) => {
      const h = height();
      el.style.transition = ease ? "height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.1)" : "none";
      el.style.height = `${Math.max(0, Math.min(px, h)).toFixed(1)}px`;
      el.style.setProperty("--lean", (1 + Math.max(0, px - h) / h).toFixed(3));
    };
    const onStart = (e: TouchEvent) => {
      armed = !going && e.touches.length === 1 && window.scrollY <= 0 && !root.dataset.sheet;
      y0 = e.touches[0]?.clientY ?? 0;
      pull = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const dy = (e.touches[0]?.clientY ?? 0) - y0;
      if (dy <= 0 || window.scrollY > 0) {
        if (pull > 0) show(0, false);
        pull = 0;
        return;
      }
      if (e.cancelable) e.preventDefault(); // ours, not the browser's refresh
      // grows with the finger, then resists past the eyes being fully out
      const h = height();
      pull = dy < h ? dy : h + (dy - h) * 0.12;
      show(pull, false);
      const ready = pull >= h * 0.9;
      if (ready !== (el.dataset.ready === "true")) {
        el.dataset.ready = String(ready);
        if (ready) {
          // far enough: the pupils open wide
          window.dispatchEvent(new CustomEvent(REACT_EVENT, { detail: { el: null } }));
          try {
            navigator.vibrate?.(8);
          } catch {}
        }
      }
      window.clearTimeout(hide);
      el.dataset.peek = "true";
    };
    const onEnd = () => {
      if (!armed) return;
      armed = false;
      if (el.dataset.ready === "true") {
        going = true;
        show(height(), true);
        window.dispatchEvent(new Event(BLINK_EVENT));
        window.setTimeout(() => window.location.reload(), still ? 0 : 520);
        return;
      }
      show(0, true);
      delete el.dataset.ready;
      window.clearTimeout(hide);
      hide = window.setTimeout(() => delete el.dataset.peek, 360);
    };
    show(0, false);
    // scrolling up at the top: out a little per notch, back after a pause
    let wheeled = 0;
    let wheelAt = 0;
    const onWheel = (e: WheelEvent) => {
      if (going || root.dataset.sheet || window.scrollY > 0 || e.deltaY >= 0) {
        if (e.deltaY > 0 && wheeled > 0) {
          wheeled = 0;
          show(0, true);
          window.clearTimeout(hide);
          hide = window.setTimeout(() => delete el.dataset.peek, 360);
        }
        return;
      }
      const now = performance.now();
      if (now - wheelAt > 2500) wheeled = 0;
      wheelAt = now;
      wheeled = Math.min(height(), wheeled + Math.min(60, -e.deltaY * 0.5));
      window.clearTimeout(hide);
      el.dataset.peek = "true";
      show(wheeled, true);
      // a good look, then back up
      hide = window.setTimeout(() => {
        wheeled = 0;
        show(0, true);
        hide = window.setTimeout(() => delete el.dataset.peek, 360);
      }, 2200);
    };
    if (touchScreen) {
      window.addEventListener("touchstart", onStart, { passive: true });
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd, { passive: true });
      window.addEventListener("touchcancel", onEnd, { passive: true });
    }
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.clearTimeout(hide);
      el.style.height = "";
      el.style.transition = "";
    };
  }, [on]);

  if (!on) return null;
  return (
    <div ref={bandRef} className="bb-band">
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
