"use client";

import Link from "next/link";
import { useState } from "react";
import Price from "./Price";
import QtyStepper from "./QtyStepper";

export type BuyVariant = { label: string; price: number; stockQty: number };

export default function ProductBuy({ variants }: { variants: BuyVariant[] }) {
  const [selected, setSelected] = useState(0);
  const variant = variants[selected];
  const inStock = variant.stockQty > 0;

  return (
    <div>
      <Price className="mb-6 block text-2xl font-medium" value={variant.price} />

      {variants.length > 1 && (
        <fieldset className="mb-8">
          <legend className="mb-3 text-sm text-muted">Option</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {variants.map((v, i) => (
              <button
                key={v.label}
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
                {v.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {inStock ? (
          <>
            <QtyStepper />
            <Link href="/cart" className="btn btn-primary">
              Add to cart
            </Link>
          </>
        ) : (
          <p className="text-muted">Out of stock.</p>
        )}
      </div>
    </div>
  );
}
