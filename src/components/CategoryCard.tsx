"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { CardProduct } from "./ProductCard";
import CategoryIcon from "./CategoryIcon";
import "./category-card.css";

// A category's card: its name and a line on the left; on the right, two or
// three of its products standing in a soft white shape. Every few seconds one
// product steps out and another pops up in its place, and a small tag drops
// in from the top with a true fact about the newcomer (its price, how many
// colours, or that it is new). The same card in every look: Light and Dark
// keep it plain; Daydream puts the category's art behind the shape.
//
// It sits at the top of a category's shelf, and on the all-products shelf it
// heads each category's run of cards (so the grid breaks into sections).

type Props = {
  name: string;
  // the category's own shelf (a link on the all-products shelf)
  slug: string;
  count: number;
  line?: string;
  products: CardProduct[];
  // a product tapped: open it over the shelf
  onOpen?: (slug: string) => void;
  // on the all-products shelf, the card links to the category
  link?: boolean;
  // which of the seven card looks (backgrounds) it wears, 0 to 6
  variant?: number;
  // a card waiting at the side of the carousel: its products hold still
  still?: boolean;
};

const SLOTS = 3;
const EVERY = 3000;


// the products worth showing: any with a photo (most options don't track
// stock, so stock can't decide it)
function poolOf(products: CardProduct[]) {
  return products.filter((p) => p.slug && p.images?.length);
}

export default function CategoryCard({ name, slug, line, products, onOpen, link, variant = 0, still = false }: Props) {
  const pool = useMemo(() => poolOf(products), [products]);
  const most = Math.min(SLOTS, pool.length);
  // the set on show (indexes into pool), the one sweeping out, and a count
  // of sets so far (so each set's cards mount fresh and play their entrance)
  const [set, setSet] = useState<number[]>(() => Array.from({ length: most }, (_, i) => i));
  const [leaving, setLeaving] = useState<{ set: number[]; round: number } | null>(null);
  const [round, setRound] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const stillRef = useRef(still);
  useEffect(() => {
    stillRef.current = still;
  }, [still]);
  // the visit's shuffled order, and how far through it the sets have got
  const orderRef = useRef<number[]>([]);
  const next = useRef(most);
  const now = useRef({ set, round });
  useEffect(() => {
    now.current = { set, round };
  }, [set, round]);

  // a different set on each visit, once on the page (the server's first
  // paint shows the first few, so nothing jumps while the page loads)
  useEffect(() => {
    if (pool.length <= most) return;
    const order = [...pool.keys()].sort(() => Math.random() - 0.5);
    orderRef.current = order;
    next.current = most;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the visit's own pick, after the first paint
    setSet(order.slice(0, most));
  }, [pool, most]);

  // every few seconds the whole set sweeps out together and a new one pops
  // in: sometimes three, sometimes two, sometimes one on its own. Only while
  // the card is on screen and the tab is in front.
  useEffect(() => {
    if (pool.length <= 1 || !root.current) return;
    let seen = false;
    let clear = 0;
    const tick = () => {
      if (!seen || document.hidden || stillRef.current) return;
      const { set: cur, round: r } = now.current;
      const order = orderRef.current.length ? orderRef.current : [...pool.keys()];
      const size = 1 + Math.floor(Math.random() * most);
      const fresh: number[] = [];
      for (let tries = 0; fresh.length < size && tries < order.length * 2; tries++) {
        const i = order[next.current++ % order.length];
        // not one that is on show now, unless there's nothing else
        if (!fresh.includes(i) && (!cur.includes(i) || pool.length <= most)) fresh.push(i);
      }
      if (!fresh.length) return;
      setLeaving({ set: cur, round: r });
      setSet(fresh);
      setRound(r + 1);
      window.clearTimeout(clear);
      clear = window.setTimeout(() => setLeaving(null), 450);
    };
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
    });
    io.observe(root.current);
    const timer = window.setInterval(tick, EVERY);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(clear);
    };
  }, [pool, most]);

  const items = set.map((i) => pool[i]).filter(Boolean);
  const gone = leaving ? leaving.set.map((i) => pool[i]).filter(Boolean) : [];

  // the name and its line up top, the button at the foot (as Blinkit's)
  const words = (
    <div className="ccard-words">
      <h2 className="ccard-name">{name}</h2>
      {line ? <p className="ccard-line">{line}</p> : null}
    </div>
  );

  return (
    <div className="ccard" ref={root} data-cat={slug} data-v={variant % 7}>
      {link ? (
        <Link href={`/shop/${slug}`} className="ccard-text">
          {words}
          <span className="ccard-cta">Shop now</span>
        </Link>
      ) : (
        <div className="ccard-text">
          {words}
          <button
            type="button"
            className="ccard-cta"
            onClick={() => root.current?.closest(".cp-main")?.querySelector(".cp-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Shop now
          </button>
        </div>
      )}
      <div className="ccard-stage" aria-hidden={!onOpen}>
        <span className="ccard-art" aria-hidden="true" />
        <span className="ccard-splat" aria-hidden="true" />
        {gone.length ? (
          <ul key={`out-${leaving!.round}`} className="ccard-items ccard-items--out" data-n={gone.length} aria-hidden="true">
            {gone.map((p, i) => (
              <li key={p.slug} className="ccard-item" data-slot={i} style={{ "--i": i } as React.CSSProperties}>
                <img src={p.images![0]} alt="" draggable={false} />
              </li>
            ))}
          </ul>
        ) : null}
        {/* no photos yet in this shelf: its icon stands on the plate instead */}
        {!items.length ? (
          <span className="ccard-icon" aria-hidden="true">
            <CategoryIcon slug={slug} size={64} />
          </span>
        ) : null}
        <ul key={`in-${round}`} className="ccard-items" data-n={items.length} data-after={round > 0 || undefined}>
          {items.map((p, i) => (
            <li key={p.slug} className="ccard-item" data-slot={i} style={{ "--i": i } as React.CSSProperties}>
              {onOpen ? (
                <button type="button" onClick={() => onOpen(p.slug!)} aria-label={p.name}>
                  <img src={p.images![0]} alt="" draggable={false} />
                </button>
              ) : (
                <Link href={p.href} aria-label={p.name}>
                  <img src={p.images![0]} alt="" draggable={false} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
