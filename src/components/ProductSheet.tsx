"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BuyVariant } from "./ProductBuy";
import Price from "./Price";
import ProductArt from "./ProductArt";
import ProductWheel, { type WheelSteer } from "./ProductWheel";
import "./product-sheet.css";

export type SheetProduct = {
  slug: string;
  href: string;
  name: string;
  tone: string;
  variants: BuyVariant[];
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
  onIndex,
  onClose,
}: {
  products: SheetProduct[];
  start: number;
  category: string;
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
  const host = typeof document === "undefined" ? null : document.getElementById("site");

  const p = products[view.i];
  const v = choice.slug === p.slug ? choice.v : 0;
  const variant = p.variants[v] ?? { label: "Standard", stockQty: 1 };
  const inStock = variant.stockQty > 0;
  const showOptions = p.variants.length > 1;

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

  // Drag the product: sideways swaps it for its neighbour, turning the wheel
  // the same way (swipe left for the next one, as the wheel turns); down
  // puts the card away. Which it is gets decided by the first few pixels.
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let dx = 0;
    let dy = 0;
    let axis: "x" | "y" | null = null;
    let art: HTMLElement | null = null;
    let id: number | null = null;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".ps-pull") || t.closest("button, a")) return;
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      t0 = e.timeStamp;
      dx = dy = 0;
      axis = null;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      dx = e.clientX - x0;
      dy = e.clientY - y0;
      if (!axis) {
        if (Math.hypot(dx, dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "y") el.style.transition = "none";
        art = el.querySelector<HTMLElement>(".ps-stage .ps-art");
        if (art) art.style.transition = "none";
      }
      if (axis === "y") {
        el.style.transform = `translateY(${Math.max(0, dy)}px)`;
      } else if (art) {
        // nothing further that way: it gives a little and springs back
        const { i, n } = at.current;
        const end = (dx < 0 && i >= n - 1) || (dx > 0 && i <= 0);
        const d = end ? dx * 0.3 : dx;
        art.style.transform = `translateX(${d.toFixed(1)}px) rotate(${(d * 0.04).toFixed(2)}deg)`;
        // the wheel leans along with the card (left drag = towards the next)
        steerRef.current?.lean(-d / el.clientWidth);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (axis === "y") {
        el.style.transition = "";
        el.style.transform = "";
        if (dy > 110) onClose();
      } else if (axis === "x") {
        const speed = Math.abs(dx) / Math.max(1, e.timeStamp - t0); // px per ms
        const go = Math.abs(dx) > 70 || (Math.abs(dx) > 25 && speed > 0.5);
        const { i, n } = at.current;
        const to = i + (dx < 0 ? 1 : -1);
        if (art) {
          art.style.transition = "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)";
          art.style.transform = "";
        }
        // turn on to the neighbour (the wheel ticks as it goes), or settle back
        steerRef.current?.to(go && to >= 0 && to < n ? to : i);
      }
      axis = null;
      art = null;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [onClose]);

  function add() {
    buzz([10, 40, 10]);
    setAdded(p.slug);
  }

  if (!host) return null;
  return createPortal(
    <div className="ps">
      <div className="ps-scrim" onClick={onClose} aria-hidden="true" />
      <section ref={card} className="ps-card" role="dialog" aria-modal="true" aria-labelledby="ps-title">
        <div className="ps-pull">
          <span className="ps-grip" aria-hidden="true" />
          <div className="ps-top">
            <button ref={closeBtn} type="button" className="ps-round" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <Link href={p.href} className="ps-full">
              Full page
            </Link>
          </div>
          <div key={p.slug} className="ps-stage" data-dir={view.dir}>
            <ProductArt name={p.name} tone={p.tone} className="ps-art" />
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
            <Price className="ps-bar-price" value={variant.price} />
          </div>
          <button type="button" className="ps-add" data-added={added === p.slug} disabled={!inStock} onClick={add}>
            {!inStock ? "Sold out" : added === p.slug ? "Added" : "Add"}
          </button>
        </footer>
      </section>

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
