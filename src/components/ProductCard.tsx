"use client";

import Link from "next/link";
import { type MouseEvent, useEffect, useState } from "react";
import { JarIcon } from "./icons";
import Price from "./Price";
import type { BuyVariant } from "./ProductBuy";
import ProductArt from "./ProductArt";

export type CardProduct = {
  href: string;
  name: string;
  options: number;
  price?: number;
  tone: string;
  // present on the category shelf, where a tap opens the product sheet
  slug?: string;
  variants?: BuyVariant[];
};

// One card, five looks. The features are fixed: image, name, price, an
// options count where a product has variants, and one "Add to cart" action.
// With onOpen, a plain tap opens the product sheet instead of the page;
// a new-tab click still goes to the page. With onAdd too, the add button
// puts a single-option product straight in the jar (its picture is passed
// along to fly in); a product with options opens the sheet to choose.
export default function ProductCard({
  product,
  onOpen,
  onAdd,
}: {
  product: CardProduct;
  onOpen?: () => void;
  onAdd?: (from: Element | null) => void;
}) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 1400);
    return () => window.clearTimeout(t);
  }, [added]);

  const plain = (e: MouseEvent) => !(e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  const open = onOpen
    ? (e: MouseEvent) => {
        if (!plain(e)) return;
        e.preventDefault();
        onOpen();
      }
    : undefined;
  const add =
    onAdd && product.options === 0
      ? (e: MouseEvent<HTMLAnchorElement>) => {
          if (!plain(e)) return;
          e.preventDefault();
          onAdd(e.currentTarget.closest(".pc")?.querySelector(".pc-img .pa") ?? null);
          setAdded(true);
        }
      : open;

  return (
    <li className="pc">
      <Link href={product.href} className="pc-link" onClick={open}>
        <div className="pc-img">
          <ProductArt name={product.name} tone={product.tone} />
        </div>
        <h3 className="pc-name">{product.name}</h3>
        {product.options > 0 && <span className="pc-opts">{product.options + 1} options</span>}
        <Price className="pc-price" value={product.price} />
      </Link>
      <Link
        href={product.href}
        className="pc-add"
        data-added={added}
        aria-label={product.options > 0 ? `Choose an option of ${product.name}` : `Add ${product.name} to cart`}
        onClick={add}
      >
        <JarIcon size={20} />
        <span className="pc-add-text">Add to cart</span>
        <span className="pc-add-short" aria-hidden="true">
          {added ? "Added" : "Add"}
        </span>
        {product.options > 0 && (
          <span className="pc-add-sub" aria-hidden="true">
            {product.options + 1} options
          </span>
        )}
      </Link>
    </li>
  );
}
