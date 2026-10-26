"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { cartCount, LANDED_EVENT, useCart } from "@/lib/cart";
import "./cart-jar.css";

// Baba's jar: the cart. Every item added drops in as a pebble, so the jar
// fills up as you shop, and it wobbles when something lands. It sits in the
// top of the product sheet, where the product is thrown into it (the bar's
// cart button takes it everywhere else).
const ROWS = 4;
const COLS = 4;
const CAP = ROWS * COLS;
// pebble colours, chosen per product so a mixed jar looks mixed
const PEBBLES = ["#ff8fb3", "#7ef0c4", "#ffd36e", "#b9a4ff", "#ff6b6b", "#8fd3ff"];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function JarArt({ pebbles }: { pebbles: string[] }) {
  // its own clip per jar: a shared one hidden with another jar hides these too
  const clip = `jar-in-${useId().replace(/:/g, "")}`;
  return (
    <svg className="jar-art" viewBox="0 0 64 76" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <rect x="10" y="18" width="44" height="52" rx="12" />
        </clipPath>
      </defs>
      <rect className="jar-glass" x="8" y="16" width="48" height="56" rx="14" />
      <g clipPath={`url(#${clip})`}>
        {pebbles.map((c, i) => {
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          // brick-laid, a little uneven, from the bottom up
          const x = 15.5 + col * 11 + (row % 2 ? 5.5 : 0);
          const y = 63.5 - row * 9.5 + ((i * 7) % 3) - 1;
          return <circle key={i} className="jar-pebble" cx={x} cy={y} r="5.6" fill={c} style={{ "--n": i } as React.CSSProperties} />;
        })}
      </g>
      <path className="jar-shine" d="M15 28 v22" />
      <rect className="jar-glass-edge" x="8" y="16" width="48" height="56" rx="14" />
      <rect className="jar-lid" x="13" y="5" width="38" height="12" rx="4" />
      <path className="jar-lid-line" d="M17 11 h30" />
    </svg>
  );
}

export default function CartJar({ variant }: { variant: "sheet" }) {
  const cart = useCart();
  const [plop, setPlop] = useState(0);
  const count = cartCount(cart);

  useEffect(() => {
    const onLand = () => setPlop((p) => p + 1);
    window.addEventListener(LANDED_EVENT, onLand);
    return () => window.removeEventListener(LANDED_EVENT, onLand);
  }, []);

  const pebbles: string[] = [];
  for (const line of cart) {
    const c = PEBBLES[hash(line.slug) % PEBBLES.length];
    for (let q = 0; q < line.qty && pebbles.length < CAP; q++) pebbles.push(c);
  }

  return (
    <Link
      href="/cart"
      className={`jar jar-${variant}`}
      data-jar={variant}
      data-empty={count === 0}
      aria-label={count === 0 ? "Cart, empty" : `Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      <span key={plop} className="jar-body" data-plop={plop > 0}>
        <JarArt pebbles={pebbles} />
      </span>
      {count > 0 && (
        <b key={`n${count}`} className="jar-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </b>
      )}
    </Link>
  );
}
