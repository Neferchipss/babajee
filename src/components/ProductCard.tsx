"use client";

import Link from "next/link";
import { type MouseEvent, type UIEvent, useEffect, useState, useSyncExternalStore } from "react";
import { formatPrice } from "@/lib/currency";
import { dealFor } from "@/lib/deal";
import { JarIcon } from "./icons";
import Price from "./Price";
import type { BuyVariant } from "./ProductBuy";
import ProductArt from "./ProductArt";
import WishButton from "./WishButton";

export type CardProduct = {
  href: string;
  name: string;
  options: number;
  price?: number;
  // the higher price it is down from, when it is on offer
  mrp?: number;
  // how it is packed, e.g. "Box of 50"
  unit?: string;
  // photo URLs, first one shown; more than one can be swiped through
  images?: string[];
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
// ?demo=photos (in development only) gives every card three stand-in photos,
// to try the swipe before real ones exist
const noop = () => () => {};
const useDemoPhotos = () =>
  useSyncExternalStore(
    noop,
    () => process.env.NODE_ENV === "development" && window.location.search.includes("demo=photos"),
    () => false,
  );

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
  const [shown, setShown] = useState(0);
  const demo = useDemoPhotos();
  const photos = product.images ?? [];
  const deal = dealFor(product.slug, product.price, product.mrp);
  const count = photos.length || (demo ? 3 : 1);
  // which photo is in view, from how far the strip has scrolled
  const onSlide = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== shown) setShown(i);
  };
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
          onAdd(e.currentTarget.closest(".pc")?.querySelectorAll(".pc-img .pa")[shown] ?? null);
          setAdded(true);
        }
      : open;

  return (
    <li className="pc">
      <Link href={product.href} className="pc-link" onClick={open}>
        <div className="pc-img">
          <div className="pc-slides" data-many={count > 1 || undefined} onScroll={count > 1 ? onSlide : undefined}>
            {Array.from({ length: count }, (_, k) => (
              <div key={k} className="pc-slide">
                {photos[k] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[k]} alt={k === 0 ? product.name : ""} className="pa pc-photo" loading="lazy" draggable={false} />
                ) : (
                  <ProductArt name={product.name} tone={product.tone} />
                )}
              </div>
            ))}
          </div>
          {count > 1 && (
            <span className="pc-dots" aria-hidden="true">
              {Array.from({ length: count }, (_, k) => (
                <i key={k} data-on={k === shown} />
              ))}
            </span>
          )}
        </div>
        <h3 className="pc-name">{product.name}</h3>
        {product.options > 0 && <span className="pc-opts">{product.options + 1} options</span>}
        {deal ? (
          <>
            <span className="pc-price pc-price--deal">
              <b className="pc-deal">{formatPrice(deal.price, { paise: true })}</b>
              <s className="pc-mrp">{formatPrice(deal.mrp, { paise: true })}</s>
            </span>
            <span className="pc-off">{formatPrice(deal.mrp - deal.price)} OFF</span>
          </>
        ) : (
          <Price className="pc-price" value={product.price} />
        )}
        {(product.unit || product.options > 0) && (
          <span className="pc-meta">
            {[product.unit, product.options > 0 ? `${product.options + 1} options` : null].filter(Boolean).join(" · ")}
          </span>
        )}
      </Link>
      {product.slug && (
        <WishButton
          className="pc-wish"
          item={{ slug: product.slug, href: product.href, name: product.name, tone: product.tone, price: product.price, options: product.options }}
        />
      )}
      <Link
        href={product.href}
        className="pc-add"
        data-added={added}
        aria-label={product.options > 0 ? `Choose an option of ${product.name}` : `Add ${product.name} to cart`}
        onClick={add}
      >
        <JarIcon size={20} />
        <svg className="pc-add-plus" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {added ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M12 5v14M5 12h14" />}
        </svg>
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
