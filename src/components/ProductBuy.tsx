"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addToCart, type CartItem, tossIntoJar } from "@/lib/cart";
import { hasOptionPhotos, OPTION_EVENT, photosFor } from "@/lib/product-photos";
import Price from "./Price";
import QtyStepper from "./QtyStepper";

export type BuyVariant = { label: string; price?: number; stockQty: number };

// Price, option picker and the add-to-cart row. The theme CSS styles it
// through the pd-* classes.
export default function ProductBuy({
  variants,
  item,
}: {
  variants: BuyVariant[];
  item: Omit<CartItem, "variant" | "price">;
}) {
  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const variant = variants[selected];
  const inStock = variant.stockQty > 0;
  const swatches = hasOptionPhotos(item.slug);
  const choose = (i: number) => {
    setSelected(i);
    window.dispatchEvent(new CustomEvent(OPTION_EVENT, { detail: variants[i].label }));
  };

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(t);
  }, [added]);

  function add() {
    addToCart({ ...item, variant: variant.label, price: variant.price }, qty);
    tossIntoJar(document.querySelector(".pd-media .pa"));
    setAdded(true);
  }

  return (
    <div className="pd-buy">
      <Price className="pd-price" value={variant.price} />

      {variants.length > 1 && (
        <fieldset className="pd-opts">
          <legend className="pd-legend">{swatches ? variant.label : "Option"}</legend>
          <div role="radiogroup" className="pd-opt-list" data-swatches={swatches || undefined}>
            {variants.map((v, i) => (
              <button
                key={v.label}
                type="button"
                role="radio"
                aria-checked={selected === i}
                onClick={() => choose(i)}
                className="pd-opt"
                aria-label={swatches ? v.label : undefined}
                title={swatches ? v.label : undefined}
              >
                {swatches ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pd-swatch" src={photosFor(item.slug, v.label)[0]} alt="" loading="lazy" draggable={false} />
                ) : (
                  v.label
                )}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="pd-actions">
        {inStock ? (
          <>
            <QtyStepper value={qty} onChange={setQty} />
            <button type="button" className="btn btn-primary pd-add" data-added={added} onClick={add}>
              {added ? "Added" : "Add to cart"}
            </button>
            {added && (
              <Link href="/cart" className="pd-view-cart">
                View cart
              </Link>
            )}
          </>
        ) : (
          <p className="pd-oos">Out of stock</p>
        )}
      </div>
    </div>
  );
}
