"use client";

import Link from "next/link";
import { useState } from "react";
import QtyStepper from "./QtyStepper";

export default function ProductBuy({
  firstOption,
  variants,
}: {
  firstOption: string;
  variants: string[];
}) {
  const options = [firstOption, ...variants];
  const [selected, setSelected] = useState(0);

  return (
    <div>
      {variants.length > 0 && (
        <fieldset className="mb-8">
          <legend className="mb-3 text-sm text-muted">Option</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {options.map((label, i) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={selected === i}
                onClick={() => setSelected(i)}
                className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  selected === i
                    ? "border-paper bg-paper text-ink"
                    : "border-[#3a3a3a] text-paper hover:border-paper"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <QtyStepper />
        <Link href="/cart" className="btn btn-primary">
          Add to cart
        </Link>
      </div>
    </div>
  );
}
