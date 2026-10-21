"use client";

import { useState } from "react";

// A quantity, - and +. Keeps its own count unless given value and onChange.
// With onChange, minus at 1 goes to 0 when `min` is 0 (the cart removes it).
export default function QtyStepper({
  initial = 1,
  value,
  onChange,
  min = 1,
  label = "quantity",
}: {
  initial?: number;
  value?: number;
  onChange?: (qty: number) => void;
  min?: number;
  label?: string;
}) {
  const [own, setOwn] = useState(initial);
  const qty = value ?? own;
  const set = (q: number) => {
    const next = Math.max(min, q);
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  return (
    <div className="qty inline-flex items-center rounded-lg border border-[#3a3a3a]">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => set(qty - 1)}
        className="h-11 w-11 cursor-pointer text-lg text-muted transition-colors hover:text-paper"
      >
        &minus;
      </button>
      <span className="w-8 text-center tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => set(qty + 1)}
        className="h-11 w-11 cursor-pointer text-lg text-muted transition-colors hover:text-paper"
      >
        +
      </button>
    </div>
  );
}
