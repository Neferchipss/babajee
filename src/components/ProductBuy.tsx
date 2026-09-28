"use client";

import Link from "next/link";
import { useState } from "react";
import Price from "./Price";
import QtyStepper from "./QtyStepper";

export type BuyVariant = { label: string; price: number; stockQty: number };

// Price, option picker and the add-to-cart row. The theme CSS styles it
// through the pd-* classes.
export default function ProductBuy({ variants }: { variants: BuyVariant[] }) {
  const [selected, setSelected] = useState(0);
  const variant = variants[selected];
  const inStock = variant.stockQty > 0;

  return (
    <div className="pd-buy">
      <Price className="pd-price" value={variant.price} />

      {variants.length > 1 && (
        <fieldset className="pd-opts">
          <legend className="pd-legend">Option</legend>
          <div role="radiogroup" className="pd-opt-list">
            {variants.map((v, i) => (
              <button
                key={v.label}
                type="button"
                role="radio"
                aria-checked={selected === i}
                onClick={() => setSelected(i)}
                className="pd-opt"
              >
                {v.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="pd-actions">
        {inStock ? (
          <>
            <QtyStepper />
            <Link href="/cart" className="btn btn-primary pd-add">
              Add to cart
            </Link>
          </>
        ) : (
          <p className="pd-oos">Out of stock</p>
        )}
      </div>
    </div>
  );
}
