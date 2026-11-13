"use client";

import { useState } from "react";
import type { CardProduct } from "./ProductCard";
import "./sold-out.css";

// The end of a shelf: what's out of stock right now, kept out of the grid
// so the shelf leads with what can be bought (like Blinkit's "Few items are
// not available"). A row of the first few, faded, and a tile with how many
// more that opens the rest. Tapping one opens it (to see it, or save it).

const SHOW = 3;

export const isSoldOut = (p: CardProduct) => !!p.variants?.length && p.variants.every((v) => v.stockQty <= 0);

export default function SoldOutRow({ products, onOpen }: { products: CardProduct[]; onOpen?: (slug: string) => void }) {
  const [all, setAll] = useState(false);
  if (!products.length) return null;
  const list = all ? products : products.slice(0, SHOW);
  const more = products.length - list.length;
  return (
    <section className="so" aria-labelledby="so-title">
      <h2 id="so-title" className="so-title">
        {products.length === 1 ? "One item is not available" : "A few items are not available"}
      </h2>
      <p className="so-sub">Back in stock soon</p>
      <ul className="so-row" data-all={all || undefined}>
        {list.map((p) => (
          <li key={p.href}>
            <button type="button" className="so-item" onClick={() => p.slug && onOpen?.(p.slug)}>
              <span className="so-img">
                {p.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0]} alt="" loading="lazy" draggable={false} />
                ) : null}
              </span>
              <span className="so-name">{p.name}</span>
            </button>
          </li>
        ))}
        {more > 0 ? (
          <li>
            <button type="button" className="so-item so-more" onClick={() => setAll(true)}>
              <span className="so-img">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
              <span className="so-name">
                +{more} item{more === 1 ? "" : "s"}
                <span className="so-all">See all</span>
              </span>
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
