"use client";

import { useId } from "react";
import "./cart-jar.css";

// Baba's jar, drawn for the cart page; each item can show as a pebble.
const COLS = 4;
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
