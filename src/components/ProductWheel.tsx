"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SEE_EVENT } from "./baba/gaze";
import ProductArt from "./ProductArt";

export type WheelItem = { key: string; name: string; tone: string };
// How the card drives the wheel: grab it, drag it by fractions of a product,
// release it onto a product; at says where it is.
export type WheelSteer = {
  grab: () => void;
  drag: (f: number) => void;
  release: (i: number) => void;
  at: () => number;
};

// The dial under the product sheet: every product in the category sits on an
// arc, and turning it with a thumb swaps the product in the sheet. It snaps
// one product at a time (with a tick on phones that can buzz), a flick spins
// it on and slows down, and a tap on a neighbour turns to it. Holding the
// eye in the middle lets Baba spin it and choose.
const STEP = 0.3; // radians between neighbours on the arc
const SPAN = 6; // products drawn either side of the middle
const HOLD_MS = 550;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const buzz = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};

type Live = {
  pos: number; // where the dial is, in products (fractional while turning)
  vel: number; // products per second
  target: number | null;
  dragging: boolean;
  spin: { from: number; to: number; at: number; dur: number } | null;
  frame: number;
  last: number;
  centre: number;
  x0: number;
  p0: number;
  moved: boolean;
  downOn: number | null;
  hold: number;
  spun: boolean;
  samples: { t: number; x: number }[];
  spacing: number;
  told: number;
};

// place every drawn product on the arc for the dial's current position
function layout(el: HTMLElement, pos: number, spacing: number) {
  const r = spacing / STEP;
  el.style.setProperty("--dial-turn", `${(-pos * STEP).toFixed(4)}rad`);
  el.querySelectorAll<HTMLElement>("[data-i]").forEach((it) => {
    const d = Number(it.dataset.i) - pos;
    const ad = Math.abs(d);
    const a = clamp(d, -SPAN, SPAN) * STEP;
    const x = r * Math.sin(a);
    const y = r * (1 - Math.cos(a));
    // the one in the middle is magnified, as under a lens, and its
    // neighbours shrink away from it smoothly as they turn past
    const s = 1.14 - Math.min(ad, 1) * 0.44 - clamp(ad - 1, 0, 4) * 0.06;
    it.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    it.style.opacity = clamp(1.2 - ad * 0.22, 0, 1).toFixed(3);
    it.style.zIndex = String(100 - Math.round(ad * 10));
  });
}

export default function ProductWheel({
  items,
  start,
  onChange,
  onPick,
  onTurn,
  steerRef,
}: {
  items: WheelItem[];
  start: number;
  onChange: (i: number) => void;
  onPick?: (i: number) => void;
  // where the dial is, as the product in the middle and how far it sits
  // from it (-0.5 to 0.5), for the cards to follow
  onTurn?: (offset: number, centre: number) => void;
  // filled in by the wheel, for a swipe on the card to turn it
  steerRef?: RefObject<WheelSteer | null>;
}) {
  const wheel = useRef<HTMLDivElement>(null);
  const [centre, setCentre] = useState(start);
  const [turned, setTurned] = useState(false);
  const cb = useRef({ onChange, onPick, onTurn });
  const live = useRef<Live>({
    pos: start,
    vel: 0,
    target: null,
    dragging: false,
    spin: null,
    frame: 0,
    last: 0,
    centre: start,
    x0: 0,
    p0: 0,
    moved: false,
    downOn: null,
    hold: 0,
    spun: false,
    samples: [],
    spacing: 90,
    told: -1,
  });
  const n = items.length;

  useEffect(() => {
    cb.current = { onChange, onPick, onTurn };
  });

  // a re-render swaps which products are drawn; put the new ones in place
  // before the browser paints them
  useLayoutEffect(() => {
    const el = wheel.current;
    if (el) layout(el, live.current.pos, live.current.spacing);
  }, [centre]);

  useEffect(() => {
    const el = wheel.current;
    if (!el || n === 0) return;
    const s = live.current;

    const measure = () => {
      s.spacing = clamp(el.clientWidth * 0.22, 74, 112);
      el.style.setProperty("--dial-r", `${(s.spacing / STEP).toFixed(1)}px`);
      layout(el, s.pos, s.spacing);
    };
    measure();

    // The wheel rests small and grows as soon as a finger drags it, and
    // shrinks as soon as it is let go, even while it is still coasting into
    // place. Swiping the card turns it without growing it.
    const pw = el.parentElement;
    let restTimer = 0;
    const wake = () => {
      window.clearTimeout(restTimer);
      if (pw && !pw.dataset.active) pw.dataset.active = "true";
    };
    const rest = (ms: number) => {
      window.clearTimeout(restTimer);
      restTimer = window.setTimeout(() => {
        if (pw && !s.dragging && !s.spin) delete pw.dataset.active;
      }, ms);
    };

    const settleCentre = () => {
      const c = clamp(Math.round(s.pos), 0, n - 1);
      if (c === s.centre) return;
      s.centre = c;
      buzz(6);
      setCentre(c);
      cb.current.onChange(c);
    };

    // the cards follow the dial
    const tell = () => {
      const off = clamp(s.pos - s.centre, -0.5, 0.5);
      if (Math.abs(off - s.told) < 0.0005) return;
      s.told = off;
      cb.current.onTurn?.(off, s.centre);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      if (s.spin) {
        const t = clamp((now - s.spin.at) / s.spin.dur, 0, 1);
        const k = 1 - (1 - t) ** 3;
        s.pos = s.spin.from + (s.spin.to - s.spin.from) * k;
        if (t >= 1) {
          s.pos = s.spin.to;
          s.spin = null;
          settleCentre();
          rest(350);
          buzz([12, 50, 18]);
          cb.current.onPick?.(s.centre);
        }
      } else if (!s.dragging) {
        if (Math.abs(s.vel) > 0.9) {
          // coasting after a flick; past either end it drags to a stop
          s.target = null;
          s.pos += s.vel * dt;
          s.vel *= Math.exp(-dt * (s.pos < 0 || s.pos > n - 1 ? 22 : 3));
        } else {
          if (s.target === null) s.target = clamp(Math.round(s.pos + s.vel * 0.12), 0, n - 1);
          s.vel = 0;
          s.pos += (s.target - s.pos) * (1 - Math.exp(-dt * 28));
          if (Math.abs(s.target - s.pos) < 0.002) s.pos = s.target;
        }
      }
      settleCentre();
      layout(el, s.pos, s.spacing);
      tell();
      const moving = s.dragging || s.spin || s.vel !== 0 || (s.target !== null && s.pos !== s.target);
      s.frame = moving ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (s.frame) return;
      s.last = performance.now();
      s.frame = requestAnimationFrame(loop);
    };

    const spin = () => {
      s.spun = true;
      s.dragging = false;
      s.vel = 0;
      s.target = null;
      let to = Math.floor(Math.random() * n);
      if (n > 1 && to === s.centre) to = (to + 1 + Math.floor(Math.random() * (n - 1))) % n;
      // go round at least a little, so it reads as a spin even next door
      const dur = clamp(1300 + Math.abs(to - s.pos) * 60, 1300, 2800);
      s.spin = { from: s.pos, to, at: performance.now(), dur };
      buzz(15);
      window.dispatchEvent(new CustomEvent(SEE_EVENT, { detail: { phase: "roll" } }));
      setTurned(true);
      wake();
      kick();
    };

    // the product under a finger dips in until the finger moves or lifts
    let pressed: HTMLElement | null = null;
    const pressOn = (it: HTMLElement | null) => {
      if (pressed) delete pressed.dataset.press;
      pressed = it;
      if (it) it.dataset.press = "true";
    };

    // a mouse wheel or trackpad turns it too, a product per notch-ish, and it
    // settles on the nearest once the scrolling stops
    let wheelEnd = 0;
    const onWheel = (e: WheelEvent) => {
      if (s.spin) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      wake();
      s.dragging = true;
      s.vel = 0;
      s.target = null;
      s.pos = clamp(s.pos + d / (s.spacing * 1.6), -0.35, n - 0.65);
      layout(el, s.pos, s.spacing);
      settleCentre();
      tell();
      setTurned(true);
      window.clearTimeout(wheelEnd);
      wheelEnd = window.setTimeout(() => {
        s.dragging = false;
        s.target = clamp(Math.round(s.pos), 0, n - 1);
        rest(250);
        kick();
      }, 110);
    };

    const indexAt = (t: EventTarget | null) => {
      const it = (t as HTMLElement | null)?.closest<HTMLElement>("[data-i]");
      return it ? Number(it.dataset.i) : null;
    };
    const onDown = (e: PointerEvent) => {
      if (s.spin || e.button > 0) return;
      el.setPointerCapture(e.pointerId);
      s.dragging = true;
      s.target = null;
      s.vel = 0;
      s.x0 = e.clientX;
      s.p0 = s.pos;
      s.moved = false;
      s.spun = false;
      s.samples = [{ t: e.timeStamp, x: e.clientX }];
      s.downOn = indexAt(e.target);
      pressOn((e.target as HTMLElement | null)?.closest<HTMLElement>("[data-i]") ?? null);
      window.clearTimeout(s.hold);
      if (s.downOn === s.centre) s.hold = window.setTimeout(spin, HOLD_MS);
      // it grows only once a drag starts (or a hold spins it): a tap just
      // turns to the product tapped
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (!s.dragging) return;
      const dx = e.clientX - s.x0;
      if (!s.moved && Math.abs(dx) > 3) {
        s.moved = true;
        wake();
        pressOn(null);
        window.clearTimeout(s.hold);
        setTurned(true);
      }
      if (!s.moved) return;
      let p = s.p0 - dx / s.spacing;
      if (p < 0) p *= 0.35;
      else if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.35;
      s.pos = p;
      s.samples.push({ t: e.timeStamp, x: e.clientX });
      while (s.samples.length > 2 && e.timeStamp - s.samples[0].t > 100) s.samples.shift();
    };
    const onUp = () => {
      window.clearTimeout(s.hold);
      pressOn(null);
      if (!s.dragging) return;
      s.dragging = false;
      if (s.spun) return;
      rest(90);
      if (!s.moved) {
        if (s.downOn !== null && s.downOn !== s.centre) s.target = s.downOn;
      } else {
        const a = s.samples[0];
        const b = s.samples[s.samples.length - 1];
        const dts = (b.t - a.t) / 1000;
        s.vel = dts > 0.005 ? clamp(-(b.x - a.x) / dts / s.spacing, -32, 32) : 0;
      }
      kick();
    };
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (step) {
        e.preventDefault();
          s.vel = 0;
        s.target = clamp((s.target ?? Math.round(s.pos)) + step, 0, n - 1);
        wake();
        rest(450);
        kick();
      } else if ((e.key === "Enter" || e.key === " ") && !s.spin) {
        e.preventDefault();
        spin();
      }
    };

    if (steerRef) {
      steerRef.current = {
        // a sideways drag on the card turns the wheel as if a finger were on
        // it (without growing it): grab, drag by fractions of a product, and
        // let go to settle on a product
        grab: () => {
          if (s.spin) return;
          s.vel = 0;
          s.target = null;
          s.dragging = true;
          s.p0 = s.pos;
          kick();
        },
        drag: (f) => {
          if (!s.dragging || s.spin) return;
          let p = s.p0 + f;
          if (p < 0) p *= 0.35;
          else if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.35;
          s.pos = p;
        },
        release: (i) => {
          if (s.spin) return;
          s.dragging = false;
          s.vel = 0;
          s.target = clamp(i, 0, n - 1);
          setTurned(true);
          kick();
        },
        at: () => s.pos,
      };
    }

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("keydown", onKey);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.clearTimeout(wheelEnd);
      el.removeEventListener("wheel", onWheel);
      if (steerRef) steerRef.current = null;
      ro.disconnect();
      window.clearTimeout(s.hold);
      window.clearTimeout(restTimer);
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("keydown", onKey);
    };
  }, [n, steerRef]);

  const from = Math.max(0, centre - SPAN - 1);
  const to = Math.min(n - 1, centre + SPAN + 1);
  const drawn = [];
  for (let i = from; i <= to; i++) drawn.push(i);

  return (
    <div className="pw">
      <div
        ref={wheel}
        className="pw-dial"
        role="slider"
        tabIndex={0}
        aria-label="Turn to browse this category. Enter lets Baba choose."
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={centre + 1}
        aria-valuetext={items[centre]?.name}
      >
        <div className="pw-ring" aria-hidden="true" />
        {drawn.map((i) => (
          <div key={items[i].key} data-i={i} data-c={i === centre} className="pw-item" aria-hidden="true">
            <ProductArt name={items[i].name} tone={items[i].tone} className="pw-art" />
          </div>
        ))}
        <svg key={centre} className="pw-eye" viewBox="0 0 120 84" aria-hidden="true">
          <path d="M4 42 Q60 -12 116 42 Q60 96 4 42 Z" />
        </svg>
      </div>
      <p className="pw-hint" data-hidden={turned}>
        Swipe or turn · hold the eye for Baba&rsquo;s pick
      </p>
    </div>
  );
}
