"use client";

import { useState } from "react";
import "./stars.css";

const STAR = "M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z";

// Five stars. Shown: filled to the rating, halves included (4.5). With
// onPick: a row of five buttons to choose a rating, which light up on hover.
export default function Stars({ value, size = 16, onPick, label }: { value: number; size?: number; onPick?: (n: number) => void; label?: string }) {
  const [hover, setHover] = useState(0);
  if (onPick) {
    const shown = hover || value;
    return (
      <span className="stars is-pick" role="radiogroup" aria-label={label ?? "Rating"} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onPick(n)}
          >
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-on={n <= shown || undefined}>
              <path d={STAR} />
            </svg>
          </button>
        ))}
      </span>
    );
  }
  const r = Math.round(value * 2) / 2;
  return (
    <span className="stars" role="img" aria-label={label ?? `${r} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = r >= n ? 1 : r >= n - 0.5 ? 0.5 : 0;
        return (
          <svg key={n} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path d={STAR} className="stars-empty" />
            {fill > 0 && <path d={STAR} className="stars-full" style={fill < 1 ? { clipPath: "inset(0 50% 0 0)" } : undefined} />}
          </svg>
        );
      })}
    </span>
  );
}
