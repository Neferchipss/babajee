"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addToCart, tossIntoJar } from "@/lib/cart";
import CartJar from "./CartJar";
import type { BuyVariant } from "./ProductBuy";
import { formatPrice } from "@/lib/currency";
import { dealFor } from "@/lib/deal";
import Price from "./Price";
import ProductArt from "./ProductArt";
import WishButton from "./WishButton";
import ProductWheel, { type WheelSteer } from "./ProductWheel";
import "./product-sheet.css";

export type SheetProduct = {
  slug: string;
  href: string;
  name: string;
  tone: string;
  variants: BuyVariant[];
  unit?: string;
};

const buzz = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};

// A product opened from the shelf, as a card floating over it, with the
// whole category on a wheel underneath (see ProductWheel). Turning the wheel
// flips the card to the next product, so a phone can browse a category with
// one thumb and never go back to the list. Pull the card down, tap outside
// it or press Escape to put it away.
export default function ProductSheet({
  products,
  start,
  category,
  categories,
  categorySlug,
  onCategory,
  onIndex,
  onClose,
}: {
  products: SheetProduct[];
  start: number;
  category: string;
  categories: { slug: string; name: string }[];
  categorySlug: string;
  onCategory: (slug: string) => void;
  onIndex: (slug: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState({ i: start, dir: 0, picked: false });
  const [choice, setChoice] = useState({ slug: "", v: 0 });
  const [added, setAdded] = useState("");
  const card = useRef<HTMLElement>(null);
  const steerRef = useRef<WheelSteer | null>(null);
  const at = useRef({ i: start, n: products.length });
  const closeBtn = useRef<HTMLButtonElement>(null);
  const cats = useRef<HTMLDivElement>(null);
  const host = typeof document === "undefined" ? null : document.getElementById("site");

  const p = products[view.i];
  const v = choice.slug === p.slug ? choice.v : 0;
  const variant = p.variants[v] ?? { label: "Standard", stockQty: 1 };
  const inStock = variant.stockQty > 0;
  const showOptions = p.variants.length > 1;
  const deal = dealFor(p.slug, variant.price);

  // lock the page behind, hide the floating third eye, Escape closes
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    root.dataset.sheet = "open";
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      delete root.dataset.sheet;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // the address follows the wheel once it comes to rest (browsers limit how
  // often it may change, so not on every product it passes)
  useEffect(() => {
    const t = window.setTimeout(() => onIndex(p.slug), 450);
    return () => window.clearTimeout(t);
  }, [p.slug, onIndex]);

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(""), 1600);
    return () => window.clearTimeout(t);
  }, [added]);

  useEffect(() => {
    at.current = { i: view.i, n: products.length };
  });

  // the category chips start with this category in the middle
  useEffect(() => {
    const row = cats.current;
    const cur = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (row && cur) row.scrollLeft = cur.offsetLeft - (row.clientWidth - cur.offsetWidth) / 2;
  }, []);

  // Drag the card: sideways, the whole card follows the finger and the wheel
  // leans with it; let go far enough (or flick) and it slides out while the
  // next product slides in from the other side, the wheel turning the same
  // way (swipe left for the next one, as the wheel turns). Down, from the
  // top half, puts it away. The first few pixels decide which.
  //
  // Touches go through touch events rather than pointer events: the details
  // can scroll, so the browser must keep vertical drags there, and only a
  // touch listener can claim a sideways drag once it is clearly sideways.
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let dx = 0;
    let dy = 0;
    let axis: "x" | "y" | null = null;
    let live = false;
    let fromTop = false;
    let mouse: number | null = null;
    const timers: number[] = [];

    const start = (x: number, y: number, t: number, target: EventTarget | null) => {
      const hit = target as HTMLElement;
      // controls keep their taps; the option chips scroll sideways themselves
      if (hit.closest("button, a, .ps-opts") || el.dataset.swipe) return false;
      x0 = x;
      y0 = y;
      t0 = t;
      dx = dy = 0;
      axis = null;
      live = true;
      fromTop = !!hit.closest(".ps-pull");
      return true;
    };
    // returns true once the drag is ours (so a touch should stop scrolling)
    const move = (x: number, y: number) => {
      if (!live) return false;
      dx = x - x0;
      dy = y - y0;
      if (!axis) {
        if (Math.hypot(dx, dy) < 8) return false;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "y" && !fromTop) {
          live = false; // a scroll of the details, not ours
          return false;
        }
        el.style.transition = "none";
      }
      if (axis === "y") {
        el.style.transform = `translateY(${Math.max(0, dy)}px)`;
      } else {
        // nothing further that way: it gives a little and springs back
        const { i, n } = at.current;
        const end = (dx < 0 && i >= n - 1) || (dx > 0 && i <= 0);
        const d = end ? dx * 0.3 : dx;
        el.style.transform = `translateX(${d.toFixed(1)}px) rotate(${(d * 0.03).toFixed(2)}deg)`;
        steerRef.current?.lean(-d / el.clientWidth);
      }
      return true;
    };
    const springBack = () => {
      el.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "";
    };
    const end = (t: number) => {
      if (!live) return;
      live = false;
      if (axis === "y") {
        springBack();
        if (dy > 110) onClose();
      } else if (axis === "x") {
        const speed = Math.abs(dx) / Math.max(1, t - t0); // px per ms
        const go = Math.abs(dx) > 70 || (Math.abs(dx) > 25 && speed > 0.5);
        const { i, n } = at.current;
        const to = i + (dx < 0 ? 1 : -1);
        if (!go || to < 0 || to >= n) {
          springBack();
          steerRef.current?.to(i);
        } else {
          // out one side; the wheel turns (the content swaps as it passes
          // the eye), then the card comes back in from the other side
          const out = dx < 0 ? -1 : 1;
          el.dataset.swipe = "true";
          el.style.transition = "transform 0.12s cubic-bezier(0.4, 0, 1, 1)";
          el.style.transform = `translateX(${out * 115}%) rotate(${out * 7}deg)`;
          steerRef.current?.to(to);
          timers.push(
            window.setTimeout(() => {
              el.style.transition = "none";
              el.style.transform = `translateX(${-out * 55}%) rotate(${-out * 4}deg)`;
              void el.offsetWidth; // apply the jump before easing back in
              el.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
              el.style.transform = "";
              timers.push(
                window.setTimeout(() => {
                  delete el.dataset.swipe;
                  el.style.transition = "";
                }, 300),
              );
            }, 125),
          );
        }
      }
      axis = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      const f = e.touches[0];
      if (e.touches.length === 1 && f) start(f.clientX, f.clientY, e.timeStamp, e.target);
      else live = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const f = e.touches[0];
      if (f && move(f.clientX, f.clientY) && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => end(e.timeStamp);
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if (!start(e.clientX, e.clientY, e.timeStamp, e.target)) return;
      mouse = e.pointerId;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId === mouse) move(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== mouse) return;
      mouse = null;
      end(e.timeStamp);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [onClose]);

  function add() {
    buzz([10, 40, 10]);
    addToCart({ slug: p.slug, href: p.href, name: p.name, tone: p.tone, variant: variant.label, price: variant.price, unit: p.unit });
    tossIntoJar(card.current?.querySelector(".ps-art") ?? null);
    setAdded(p.slug);
  }

  if (!host) return null;
  return createPortal(
    <div className="ps">
      <div className="ps-scrim" onClick={onClose} aria-hidden="true" />
      {/* the chips sit right on top of the card, whatever its height */}
      <div className="ps-stack">
        <div ref={cats} className="ps-cats" role="group" aria-label="Categories">
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="ps-cat-chip"
              aria-current={c.slug === categorySlug}
              onClick={() => {
                buzz(6);
                onCategory(c.slug);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <section ref={card} className="ps-card" role="dialog" aria-modal="true" aria-labelledby="ps-title">
          <div className="ps-pull">
            <span className="ps-grip" aria-hidden="true" />
            <div className="ps-top">
              <button ref={closeBtn} type="button" className="ps-round" onClick={onClose} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div className="ps-top-end">
                <WishButton item={{ slug: p.slug, href: p.href, name: p.name, tone: p.tone, price: variant.price, options: Math.max(0, p.variants.length - 1) }} />
                <Link href={p.href} className="ps-full">
                  Full page
                </Link>
                <CartJar variant="sheet" />
              </div>
            </div>
            <div key={p.slug} className="ps-stage" data-dir={view.dir}>
              <ProductArt name={p.name} tone={p.tone} slug={p.slug} className="ps-art" />
              {view.picked && <span className="ps-picked">Baba&rsquo;s pick</span>}
            </div>
          </div>

          <div key={`info-${p.slug}`} className="ps-info" data-dir={view.dir}>
            <p className="ps-cat">{category}</p>
            <h2 id="ps-title" className="ps-title">
              {p.name}
            </h2>
            {showOptions && (
              <div className="ps-opts" role="radiogroup" aria-label="Options">
                {p.variants.map((o, k) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={k === v}
                    className="ps-opt"
                    onClick={() => {
                      buzz(5);
                      setChoice({ slug: p.slug, v: k });
                    }}
                  >
                    <span className="ps-opt-label">{o.label}</span>
                    <Price className="ps-opt-price" value={o.price} />
                    {o.stockQty <= 0 && <span className="ps-opt-out">Sold out</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <footer className="ps-bar">
            <div className="ps-bar-what">
              <span className="ps-bar-label">{variant.label}</span>
              {deal ? (
              <span className="ps-bar-price ps-bar-deal">
                {formatPrice(deal.price, { paise: true })} <s>{formatPrice(deal.mrp, { paise: true })}</s>
              </span>
            ) : (
              <Price className="ps-bar-price" value={variant.price} />
            )}
            </div>
            <button type="button" className="ps-add" data-added={added === p.slug} disabled={!inStock} onClick={add}>
              {!inStock ? "Sold out" : added === p.slug ? "Added" : "Add"}
            </button>
          </footer>
        </section>
      </div>

      <ProductWheel
        items={products.map((x) => ({ key: x.slug, name: x.name, tone: x.tone }))}
        start={start}
        onChange={(i) => setView((w) => ({ i, dir: i > w.i ? 1 : -1, picked: false }))}
        onPick={(i) => setView((w) => ({ ...w, i, picked: true }))}
        steerRef={steerRef}
      />
    </div>,
    host,
  );
}
