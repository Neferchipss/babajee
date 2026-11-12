"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addToCart, tossIntoJar } from "@/lib/cart";
import { formatPrice } from "@/lib/currency";
import { dealFor } from "@/lib/deal";
import { fadeIn } from "@/lib/fade-in";
import { hasOptionPhotos, photosFor, shelfPicks } from "@/lib/product-photos";
import AddLabel from "./AddLabel";
import Branded from "./Branded";
import Price from "./Price";
import ProductArt from "./ProductArt";
import type { SheetProduct } from "./ProductSheet";
import QtyStepper from "./QtyStepper";
import WishButton from "./WishButton";
import "./product-desk.css";
import { track } from "@/lib/track";
import ProductReviews, { RatingLine } from "./ProductReviews";

// A product on a wide screen, as a traditional shop page: big photos on the
// left with thumbnails under them, and on the right the name, price, options,
// quantity and Add to cart, then the description. It opens over the shelf
// at the same address (?p=slug) the phone's card uses, so links, Back and
// the cart behave the same; the shelf's header stays on top.
export default function ProductDesk({
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
  const [i, setI] = useState(start);
  // which way the last step went (-1 back, 1 on), for the details' slide in
  const [dir, setDir] = useState(0);
  const [choice, setChoice] = useState({ slug: "", v: 0 });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState("");
  const [about, setAbout] = useState<{ slug: string; description: string; brand: string; specs: { label: string; value: string }[] } | null>(null);
  // where the header sits: the page starts under it and lines up with its
  // edges (the logo on the left, Profile on the right)
  const [box, setBox] = useState({ top: 0, left: 0, width: 0 });
  const page = useRef<HTMLDivElement>(null);
  // the latest go(), for the arrow keys (the key listener is set up once)
  const step = useRef<(d: number) => void>(() => {});
  const host = typeof document === "undefined" ? null : document.getElementById("site");

  const p = products[i];
  const v = choice.slug === p.slug ? choice.v : Math.max(0, p.variants.findIndex((x) => x.label === shelfPicks.get(p.slug)));
  const variant = p.variants[v] ?? { label: "Standard", stockQty: 1 };
  const many = p.variants.length > 1;
  const swatches = hasOptionPhotos(p.slug);
  const deal = dealFor(variant.price, p.mrp);
  const out = variant.stockQty <= 0;
  const noPrice = !variant.price;

  // under the shop's header (its category strip hidden: this is one product,
  // not a shelf), which stays usable; the page behind is locked
  useEffect(() => {
    document.documentElement.dataset.desk = "open";
    const bar = document.querySelector<HTMLElement>(".sb");
    // the logo's left edge to Profile's right edge (on wide screens the
    // logo sits in the category panel, left of the bar)
    const logo = document.querySelector<HTMLElement>(".sb-logo");
    const me = document.querySelector<HTMLElement>(".sb-me");
    const place = () => {
      const b = bar?.getBoundingClientRect();
      const l = logo?.getBoundingClientRect();
      const r = me?.getBoundingClientRect();
      const left = Math.round((l?.width ? l.left : b?.left) ?? 0);
      const right = Math.round((r?.width ? r.right : b?.right) ?? 0);
      setBox({ top: Math.max(0, Math.round(b?.bottom ?? 0)), left, width: Math.max(0, right - left) });
    };
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    root.dataset.sheet = "open";
    // measured once the page's scrollbar has gone, which shifts the header
    place();
    window.addEventListener("resize", place);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // ← and → step through the category, unless typing somewhere
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]");
      if (!typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) step.current(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
      root.style.overflow = before;
      delete root.dataset.sheet;
      delete root.dataset.desk;
    };
  }, [onClose]);

  // a new product: the address follows, the page starts at the top, quantity
  // back to 1, and the look is recorded for the customer's activity
  useEffect(() => {
    onIndex(p.slug);
    page.current?.scrollTo({ top: 0 });
  }, [p.slug, onIndex]);
  useEffect(() => {
    track("product", `${location.pathname}?p=${encodeURIComponent(p.slug)}`, p.name);
  }, [p.slug, p.name]);

  // its description and brand, which the shelf doesn't carry
  useEffect(() => {
    let live = true;
    import("@/lib/catalog-db")
      .then((m) => m.getProductDescription(p.slug))
      .then((d) => live && setAbout({ slug: p.slug, ...d }))
      .catch(() => live && setAbout({ slug: p.slug, description: "", brand: "", specs: [] }));
    return () => {
      live = false;
    };
  }, [p.slug]);

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(""), 1600);
    return () => window.clearTimeout(t);
  }, [added]);

  const go = (to: number) => {
    if (to < 0 || to >= products.length) return;
    setDir(to > i ? 1 : -1);
    setI(to);
    setQty(1);
  };
  useEffect(() => {
    step.current = (d) => go(i + d);
  });

  function add() {
    addToCart({ slug: p.slug, href: p.href, name: p.name, tone: p.tone, variant: variant.label, price: variant.price, unit: p.unit }, qty);
    tossIntoJar(page.current?.querySelector(".pdk-main img, .pdk-main .pa") ?? null);
    setAdded(p.slug);
  }

  const info = about?.slug === p.slug ? about : null;
  if (!host) return null;
  return createPortal(
    <div
      ref={page}
      className="pdk"
      style={{ top: box.top, ["--pdk-l" as string]: `${box.left}px`, ["--pdk-w" as string]: box.width ? `${box.width}px` : undefined }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdk-title"
    >
      <div className="pdk-inner">
        <div className="pdk-grid">
          <Gallery key={`${p.slug}:${variant.label}`} name={p.name} tone={p.tone} slug={p.slug} option={variant.label} />

          <div key={p.slug} className="pdk-side" data-dir={dir || undefined}>
            <p className="pdk-eyebrow">{[info?.brand, p.group ?? category].filter(Boolean).join(" · ")}</p>
            <h1 id="pdk-title" className="pdk-title">
              <Branded name={p.name} />
            </h1>
            <RatingLine slug={p.slug} target="pdk-reviews" />

            <div className="pdk-price">
              {deal ? (
                <>
                  <span className="pdk-now">{formatPrice(deal.price, { paise: true })}</span>
                  <s>{formatPrice(deal.mrp, { paise: true })}</s>
                  <span className="pdk-off">{Math.round(((deal.mrp - deal.price) / deal.mrp) * 100)}% off</span>
                </>
              ) : (
                <Price className="pdk-now" value={variant.price} />
              )}
              {p.unit && <span className="pdk-unit">{p.unit}</span>}
            </div>

            {many && (
              <div className="pdk-opts-wrap">
                <p className="pdk-label">
                  Option: <b>{variant.label}</b>
                </p>
                <div className={`pdk-opts ${swatches ? "is-swatch" : ""}`} role="radiogroup" aria-label="Options">
                  {p.variants.map((o, k) => (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={k === v}
                      className="pdk-opt"
                      title={o.label}
                      aria-label={swatches ? o.label : undefined}
                      onClick={() => setChoice({ slug: p.slug, v: k })}
                    >
                      {swatches ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photosFor(p.slug, o.label)[0]} alt="" loading="lazy" draggable={false} />
                      ) : (
                        <>
                          <span>{o.label}</span>
                          {o.price ? <Price className="pdk-opt-price" value={o.price} /> : null}
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pdk-buy">
              <QtyStepper value={qty} onChange={setQty} label={`${p.name} quantity`} />
              <button type="button" className="pdk-add" onClick={add} disabled={out || noPrice} data-added={added === p.slug}>
                <AddLabel text={noPrice ? "Price coming soon" : out ? "Out of stock" : added === p.slug ? "Added to cart" : "Add to cart"} done={added === p.slug} />
              </button>
              <WishButton
                className="pdk-wish"
                item={{ slug: p.slug, href: p.href, name: p.name, tone: p.tone, price: variant.price, options: Math.max(0, p.variants.length - 1) }}
              />
            </div>

            {info?.description ? (
              <section className="pdk-about">
                <h2>About this product</h2>
                <p>{info.description}</p>
              </section>
            ) : null}
            {info?.specs.length ? (
              <section className="pdk-about pdk-specs">
                <h2>Specifications</h2>
                <dl>
                  {info.specs.map((s) => (
                    <div key={s.label}>
                      <dt>{s.label}</dt>
                      <dd>{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            <ProductReviews slug={p.slug} id="pdk-reviews" />
          </div>
        </div>
      </div>

      {/* close, top right, under Profile */}
      <button type="button" className="pdk-close" onClick={onClose} aria-label={`Close, back to ${category}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {/* back to the shelf, in the screen's bottom-left corner */}
      <button type="button" className="pdk-back" onClick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back to {category}
      </button>

      {/* the previous and next product in this category, at the screen's edges */}
      {[-1, 1].map((d) => {
        const to = products[i + d];
        if (!to) return null;
        return (
          <button key={d} type="button" className="pdk-edge" data-dir={d} onClick={() => go(i + d)} aria-label={`${d < 0 ? "Previous" : "Next"} product: ${to.name}`} title={to.name}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
            </svg>
          </button>
        );
      })}
    </div>,
    host,
  );
}

// Big photo with thumbnails under it; arrows step through, a thumbnail jumps.
function Gallery({ name, tone, slug, option }: { name: string; tone: string; slug: string; option: string }) {
  const photos = photosFor(slug, option);
  const [k, setK] = useState(0);
  const at = Math.min(k, Math.max(0, photos.length - 1));
  return (
    <div className="pdk-media">
      <div className="pdk-main">
        {photos[at] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...fadeIn} key={photos[at]} src={photos[at]} alt={name} draggable={false} />
        ) : (
          <ProductArt name={name} tone={tone} slug={slug} />
        )}
        {photos.length > 1 &&
          [-1, 1].map((d) => (
            <button
              key={d}
              type="button"
              className="pdk-arrow"
              data-dir={d}
              onClick={() => setK((at + d + photos.length) % photos.length)}
              aria-label={d < 0 ? "Previous photo" : "Next photo"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
              </svg>
            </button>
          ))}
      </div>
      {photos.length > 1 && (
        <div className="pdk-thumbs" role="tablist" aria-label="Photos">
          {photos.map((src, n) => (
            <button key={src} type="button" role="tab" aria-selected={n === at} aria-label={`Photo ${n + 1} of ${photos.length}`} onClick={() => setK(n)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img {...fadeIn} src={src} alt="" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
