"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReviewSummary } from "@/lib/reviews";
import Stars from "./Stars";
import "./product-reviews.css";
import { useFocusTrap } from "@/lib/use-focus-trap";

// A product's approved reviews, fetched once per product per page load and
// shared by the rating line (under the price) and the reviews section.
const cache = new Map<string, Promise<ReviewSummary>>();
const EMPTY: ReviewSummary = { average: 0, count: 0, reviews: [] };

function load(slug: string) {
  let p = cache.get(slug);
  if (!p) {
    p = import("@/lib/reviews").then((m) => m.productReviews(slug)).catch(() => EMPTY);
    cache.set(slug, p);
  }
  return p;
}

function useReviews(slug: string): ReviewSummary | null {
  const [got, setGot] = useState<{ slug: string; data: ReviewSummary } | null>(null);
  useEffect(() => {
    let live = true;
    load(slug).then((data) => live && setGot({ slug, data }));
    return () => {
      live = false;
    };
  }, [slug]);
  return got?.slug === slug ? got.data : null;
}

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

// "★★★★☆ 4.3 · 12 reviews", linking down to the reviews; nothing until there is one
export function RatingLine({ slug, target, onOpen }: { slug: string; target?: string; onOpen?: () => void }) {
  const r = useReviews(slug);
  if (!r?.count) return null;
  const inside = (
    <>
      <Stars value={r.average} size={15} />
      <span>{r.average.toFixed(1)}</span>
      <span className="rv-muted">
        · {r.count} review{r.count === 1 ? "" : "s"}
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className="rv-line" onClick={onOpen}>
      {inside}
    </button>
  ) : (
    <a className="rv-line" href={target ? `#${target}` : undefined}>
      {inside}
    </a>
  );
}

// on a phone: the reviews in a panel over the product card
export function ReviewsPanel({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useFocusTrap(panel, true, { initial: close });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  // on the page itself, not inside the card: the card moves with swipes and
  // would carry the panel (and its scrolling) with it
  return createPortal(
    <div ref={panel} className="rv-panel" role="dialog" aria-modal="true" aria-label={`Reviews of ${name}`}>
      <button type="button" className="rv-scrim" aria-label="Close reviews" tabIndex={-1} onClick={onClose} />
      <div className="rv-sheet">
        <div className="rv-sheet-bar">
          <p>{name}</p>
          <button ref={close} type="button" className="rv-close" onClick={onClose} aria-label="Close reviews">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <ProductReviews slug={slug} />
      </div>
    </div>,
    document.getElementById("site") ?? document.body,
  );
}

// the reviews themselves; nothing until there is one
export default function ProductReviews({ slug, id }: { slug: string; id?: string }) {
  const r = useReviews(slug);
  if (!r?.count) return null;
  return (
    <section className="rv" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="rv-head">
        <h2 id={id ? `${id}-title` : undefined}>Reviews</h2>
        <p className="rv-sum">
          <b>{r.average.toFixed(1)}</b>
          <Stars value={r.average} size={16} />
          <span className="rv-muted">
            {r.count} review{r.count === 1 ? "" : "s"}
          </span>
        </p>
      </div>
      <ul className="rv-list">
        {r.reviews.map((x) => (
          <li key={x.id}>
            <div className="rv-top">
              <Stars value={x.rating} size={13} />
              {x.title && <b>{x.title}</b>}
            </div>
            {x.body && <p className="rv-body">{x.body}</p>}
            <p className="rv-by">
              {x.author} · <span className="rv-verified">Verified buyer</span> · {DATE.format(new Date(x.created_at))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
