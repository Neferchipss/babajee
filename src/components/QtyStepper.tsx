"use client";

import { useState } from "react";

export default function QtyStepper({ initial = 1 }: { initial?: number }) {
  const [qty, setQty] = useState(initial);
  return (
    <div className="inline-flex items-center rounded-lg border border-[#3a3a3a]">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => setQty((q) => Math.max(1, q - 1))}
        className="h-11 w-11 cursor-pointer text-lg text-muted transition-colors hover:text-paper"
      >
        &minus;
      </button>
      <span className="w-8 text-center tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => setQty((q) => q + 1)}
        className="h-11 w-11 cursor-pointer text-lg text-muted transition-colors hover:text-paper"
      >
        +
      </button>
    </div>
  );
}
