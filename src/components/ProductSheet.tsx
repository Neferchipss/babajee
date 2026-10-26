"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addToCart, tossIntoJar } from "@/lib/cart";
import Branded from "./Branded";
import type { BuyVariant } from "./ProductBuy";
import { formatPrice } from "@/lib/currency";
import { dealFor } from "@/lib/deal";
import { hasOptionPhotos, photosFor, shelfPicks } from "@/lib/product-photos";
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
  // its category, on the all-products and search shelves
  group?: string;
};

// the space between one product's card and the next in the carousel
const CARD_GAP = 16;

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
  // the option picked on the shelf card, until one is chosen here
  const v =
    choice.slug === p.slug ? choice.v : Math.max(0, p.variants.findIndex((x) => x.label === shelfPicks.get(p.slug)));
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

  // The photo takes whatever height is left once the name, options and Add
  // bar have theirs, so the details never scroll under it. Measured, since
  // the room left by a phone's browser bars and the details' height (a long
  // name, a row of swatches) both vary.
  useLayoutEffect(() => {
    const el = card.current;
    const box = el?.parentElement; // the strip of cards, which all take this size
    const stack = box?.parentElement;
    if (!el || !box || !stack) return;
    const fit = () => {
      const art = el.querySelector<HTMLElement>(".ps-art");
      if (!art) return;
      const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
      let room = stack.clientHeight;
      for (const c of Array.from(stack.children)) if (c !== box) room -= (c as HTMLElement).offsetHeight + gap;
      const rest = el.scrollHeight + (el.offsetHeight - el.clientHeight) - art.offsetHeight; // with its border
      const size = `${Math.max(140, Math.floor(room - rest))}px`;
      if (box.style.getPropertyValue("--ps-fit") !== size) box.style.setProperty("--ps-fit", size);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stack);
    const info = el.querySelector(".ps-info");
    if (info) ro.observe(info);
    return () => ro.disconnect();
  }, [p.slug, v]);

  // keep the chosen option's chip in view (a swipe through the photos can
  // choose one that is scrolled out of sight)
  useEffect(() => {
    const row = card.current?.querySelector<HTMLElement>(".ps-opts");
    const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (row && chip) row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [v, p.slug]);


  // Drag the card: sideways, it turns the wheel, and the cards slide with it
  // as a carousel (swipe left for the next one); let go far enough (or
  // flick) and it settles on the next product, otherwise back. Down, from
  // the top half, puts it away. The first few pixels decide which.
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
    // a photo strip under the finger swipes its own photos, and hands the
    // swipe to the card only once it is at its first or last photo
    let gallery: HTMLElement | null = null;
    // the card width plus the gap to the next card: one product on the wheel
    const step = () => el.offsetWidth + CARD_GAP;

    const start = (x: number, y: number, t: number, target: EventTarget | null) => {
      const hit = target as HTMLElement;
      // controls keep their taps; the option chips scroll sideways themselves
      if (hit.closest("button, a, .ps-opts")) return false;
      gallery = hit.closest<HTMLElement>(".ps-gallery");
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
        if (axis === "x" && gallery) {
          const g = gallery;
          const atEnd = dx < 0 ? g.scrollLeft >= g.scrollWidth - g.clientWidth - 2 : g.scrollLeft <= 2;
          if (!atEnd) {
            live = false; // browsing the photos
            return false;
          }
        }
        el.style.transition = "none";
        if (axis === "x") steerRef.current?.grab();
      }
      if (axis === "y") el.style.transform = `translateY(${Math.max(0, dy)}px)`;
      else steerRef.current?.drag(-dx / step()); // (it gives at either end)
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
        // settle on the product nearest where it was let go, or the next one
        // along once it is a third of the way there, or on a flick
        const speed = Math.abs(dx) / Math.max(1, t - t0); // px per ms
        const pos = steerRef.current?.at() ?? at.current.i;
        let to = Math.round(pos);
        if (to === at.current.i && (Math.abs(dx) > step() * 0.3 || (Math.abs(dx) > 25 && speed > 0.5))) to += dx < 0 ? 1 : -1;
        steerRef.current?.release(to);
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

  // The cards follow the wheel as a carousel: the strip of cards (this one,
  // with the products either side) slides one card along per product, so
  // halfway to the next product half of each card shows. When the product
  // in the middle changes, the strip is put back only once the new card has
  // drawn, so no frame shows the old one in the wrong place.
  const strip = useRef<HTMLDivElement>(null);
  const turn = useRef({ off: 0, c: start });
  const drawn = useRef(start);
  const place = () => {
    const t = strip.current;
    const el = card.current;
    if (!t || !el) return;
    const { off } = turn.current;
    t.style.transform = Math.abs(off) < 0.001 ? "" : `translateX(${(-off * (el.offsetWidth + CARD_GAP)).toFixed(1)}px)`;
  };
  function follow(off: number, c: number) {
    turn.current = { off, c };
    if (c === drawn.current) place();
  }
  useLayoutEffect(() => {
    drawn.current = view.i;
    if (turn.current.c === view.i) place();
  }, [view.i]);



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
      <div className="ps-stack">
        <div ref={strip} className="ps-strip">
        {products[view.i - 1] && <GhostCard p={products[view.i - 1]} category={category} side={-1} />}
        {products[view.i + 1] && <GhostCard p={products[view.i + 1]} category={category} side={1} />}
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
              </div>
            </div>
            <div key={p.slug} className="ps-stage" data-dir={view.dir}>
              <SheetPhotos key={variant.label} name={p.name} tone={p.tone} slug={p.slug} option={variant.label} />
              {view.picked && <span className="ps-picked">Baba&rsquo;s pick</span>}
            </div>
          </div>

          <div key={`info-${p.slug}`} className="ps-info" data-dir={view.dir}>
            <p className="ps-cat">{p.group ?? category}</p>
            <h2 id="ps-title" className="ps-title">
              <Branded name={p.name} />
            </h2>
            {showOptions && (
              <div className="ps-opts" role="radiogroup" aria-label="Options" data-swatches={hasOptionPhotos(p.slug) || undefined}>
                {p.variants.map((o, k) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={k === v}
                    className="ps-opt"
                    aria-label={hasOptionPhotos(p.slug) ? o.label : undefined}
                    title={hasOptionPhotos(p.slug) ? o.label : undefined}
                    onClick={() => {
                      buzz(5);
                      setChoice({ slug: p.slug, v: k });
                    }}
                  >
                    {hasOptionPhotos(p.slug) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="ps-swatch" src={photosFor(p.slug, o.label)[0]} alt="" loading="lazy" draggable={false} />
                    ) : (
                      <>
                        <span className="ps-opt-label">{o.label}</span>
                        <Price className="ps-opt-price" value={o.price} />
                      </>
                    )}
                    {o.stockQty <= 0 && <span className="ps-opt-out">Sold out</span>}
                  </button>
                ))}
              </div>
            )}
            {/* no options: the row's room is kept, empty, so every card is the same size */}
            {!showOptions && <div className="ps-opts ps-opts--none" aria-hidden="true" />}
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
      </div>

      <ProductWheel
        items={products.map((x) => ({ key: x.slug, name: x.name, tone: x.tone }))}
        start={start}
        onChange={(i) => setView((w) => ({ i, dir: i > w.i ? 1 : -1, picked: false }))}
        onPick={(i) => setView((w) => ({ ...w, i, picked: true }))}
        steerRef={steerRef}
        onTurn={follow}
      />
    </div>,
    host,
  );
}

// The product's photos in the sheet: one, or a strip to swipe through with
// dots under it (a dot also jumps to its photo). Where the photos show the
// product's options, only the chosen option's photos are here.
function SheetPhotos({ name, tone, slug, option }: { name: string; tone: string; slug: string; option: string }) {
  const photos = photosFor(slug, option);
  const strip = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const go = (k: number) => {
    const g = strip.current;
    if (g) g.scrollTo({ left: Math.max(0, Math.min(photos.length - 1, k)) * g.clientWidth, behavior: "smooth" });
  };
  if (photos.length < 2) {
    // eslint-disable-next-line @next/next/no-img-element
    if (photos[0]) return <div className="ps-art ps-photos"><img className="ps-one" src={photos[0]} alt={name} /></div>;
    return <ProductArt name={name} tone={tone} slug={slug} className="ps-art" />;
  }
  return (
    <div className="ps-art ps-photos">
      <div
        ref={strip}
        className="ps-gallery"
        onScroll={(e) => {
          const g = e.currentTarget;
          const i = Math.round(g.scrollLeft / Math.max(1, g.clientWidth));
          if (i !== shown) setShown(i);
        }}
      >
        {photos.map((src, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={k === 0 ? name : ""} loading={k ? "lazy" : "eager"} draggable={false} />
        ))}
      </div>
      {/* with a mouse there is no swipe: arrows either side step through */}
      {[-1, 1].map((d) => (
        <button
          key={d}
          type="button"
          className="ps-nav"
          data-dir={d}
          hidden={d < 0 ? shown === 0 : shown === photos.length - 1}
          aria-label={d < 0 ? "Previous photo" : "Next photo"}
          onClick={() => go(shown + d)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
          </svg>
        </button>
      ))}
      <div className="ps-dots">
        {photos.map((src, k) => (
          <button
            key={src}
            type="button"
            data-on={k === shown}
            aria-label={`Photo ${k + 1} of ${photos.length}`}
            onClick={() => go(k)}
          />
        ))}
      </div>
    </div>
  );
}

// A neighbouring product's card, beside this one in the carousel: the same
// card as it opens (first option, first photo), only to look at.
function GhostCard({ p, category, side }: { p: SheetProduct; category: string; side: 1 | -1 }) {
  const photo = photosFor(p.slug)[0];
  const swatches = hasOptionPhotos(p.slug);
  const first = p.variants[0] ?? { label: "Standard", stockQty: 1 };
  const deal = dealFor(p.slug, first.price);
  return (
    <div className="ps-card ps-ghost" data-side={side} aria-hidden="true">
      <div className="ps-pull">
        <span className="ps-grip" />
        <div className="ps-top">
          <span className="ps-round">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          <div className="ps-top-end">
            <span className="wish">
              <svg className="wish-heart" width="20" height="20" viewBox="0 0 24 24">
                <path d="M12 20.3s-7.8-4.7-7.8-10.4A4.5 4.5 0 0 1 12 7.3a4.5 4.5 0 0 1 7.8 2.6c0 5.7-7.8 10.4-7.8 10.4Z" />
              </svg>
            </span>
          </div>
        </div>
        <div className="ps-stage">
          {photo ? (
            <div className="ps-art ps-photos">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ps-one" src={photo} alt="" draggable={false} />
            </div>
          ) : (
            <ProductArt name={p.name} tone={p.tone} slug={p.slug} className="ps-art" />
          )}
        </div>
      </div>
      <div className="ps-info">
        <p className="ps-cat">{p.group ?? category}</p>
        <h2 className="ps-title">
          <Branded name={p.name} />
        </h2>
        <div className={p.variants.length > 1 ? "ps-opts" : "ps-opts ps-opts--none"} data-swatches={swatches || undefined}>
          {p.variants.length > 1 &&
            p.variants.map((o, k) => (
              <span key={o.label} className="ps-opt" aria-checked={k === 0}>
                {swatches ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ps-swatch" src={photosFor(p.slug, o.label)[0]} alt="" draggable={false} />
                ) : (
                  <>
                    <span className="ps-opt-label">{o.label}</span>
                    <Price className="ps-opt-price" value={o.price} />
                  </>
                )}
              </span>
            ))}
        </div>
      </div>
      <footer className="ps-bar">
        <div className="ps-bar-what">
          <span className="ps-bar-label">{first.label}</span>
          {deal ? (
            <span className="ps-bar-price ps-bar-deal">
              {formatPrice(deal.price, { paise: true })} <s>{formatPrice(deal.mrp, { paise: true })}</s>
            </span>
          ) : (
            <Price className="ps-bar-price" value={first.price} />
          )}
        </div>
        <span className="ps-add">Add</span>
      </footer>
    </div>
  );
}
