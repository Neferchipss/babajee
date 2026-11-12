"use client";

import Link from "next/link";
import { type MouseEvent, type UIEvent, useRef, useState, useSyncExternalStore } from "react";
import { formatPrice } from "@/lib/currency";
import { fadeIn } from "@/lib/fade-in";
import { dealFor } from "@/lib/deal";
import { dotColour, optionsWithPhotos, photosFor, shelfPicks } from "@/lib/product-photos";
import Branded from "./Branded";
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
  // on the all-products shelf, the category it is listed under
  group?: string;
  // its own search-engine title, when the admin wrote one (for the tab title)
  seoTitle?: string;
};

// One card, five looks. The features are fixed: image, name, price, an
// options count where a product has variants, and one "Add to cart" action.
// With onOpen, a plain tap opens the product sheet instead of the page;
// a new-tab click still goes to the page. Adding to the cart happens in the
// sheet or on the product page; the card itself has no add button.
// ?demo=photos (in development only) gives every card three stand-in photos,
// to try the swipe before real ones exist
const noop = () => () => {};
const MAX_DOTS = 6;
const useDemoPhotos = () =>
  useSyncExternalStore(
    noop,
    () => process.env.NODE_ENV === "development" && window.location.search.includes("demo=photos"),
    () => false,
  );

export default function ProductCard({
  product,
  onOpen,
}: {
  product: CardProduct;
  onOpen?: () => void;
}) {
  const [shown, setShown] = useState(0);
  const demo = useDemoPhotos();
  // options with their own photos show as dots under the card (a colour, or
  // a tiny photo for a pattern); a dot swaps the card's photos to its option
  const opts = optionsWithPhotos(product.slug);
  const [opt, setOpt] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const photos = opts.length > 1 && opt > 0 ? photosFor(product.slug, opts[opt]) : (product.images ?? []);
  const pick = (k: number) => {
    setOpt(k);
    setShown(0);
    strip.current?.scrollTo({ left: 0 });
    shelfPicks.set(product.slug!, opts[k]);
    try {
      navigator.vibrate?.(6);
    } catch {}
  };
  const deal = dealFor(product.price, product.mrp);
  const count = photos.length || (demo ? 3 : 1);
  // which photo is in view, from how far the strip has scrolled
  const onSlide = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== shown) setShown(i);
  };

  const plain = (e: MouseEvent) => !(e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  const open = onOpen
    ? (e: MouseEvent) => {
        if (!plain(e)) return;
        e.preventDefault();
        onOpen();
      }
    : undefined;

  return (
    <li className="pc">
      <Link href={product.href} className="pc-link" onClick={open}>
        <div className="pc-img">
          <div ref={strip} className="pc-slides" data-many={count > 1 || undefined} onScroll={count > 1 ? onSlide : undefined}>
            {Array.from({ length: count }, (_, k) => (
              <div key={`${opt}-${k}`} className="pc-slide">
                {photos[k] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img {...fadeIn} src={photos[k]} alt={k === 0 ? product.name : ""} className="pa pc-photo" loading="lazy" draggable={false} />
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
        <h3 className="pc-name">
          <Branded name={product.name} />
        </h3>
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
            {[product.unit, opts.length > 1 ? opts[opt] : product.options > 0 ? `${product.options + 1} options` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </Link>
      {opts.length > 1 && (
        <div className="pc-dotrow" role="radiogroup" aria-label={`${product.name} options`}>
          {opts.slice(0, MAX_DOTS).map((label, k) => {
            const colour = dotColour(label);
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={k === opt}
                aria-label={label}
                title={label}
                className="pc-dot"
                style={colour ? ({ "--dot": colour } as React.CSSProperties) : undefined}
                onClick={() => pick(k)}
              >
                {!colour && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photosFor(product.slug, label)[0]} alt="" loading="lazy" draggable={false} />
                )}
              </button>
            );
          })}
          {opts.length > MAX_DOTS && <span className="pc-dot-more">+{opts.length - MAX_DOTS}</span>}
        </div>
      )}
      {product.slug && (
        <WishButton
          className="pc-wish"
          item={{ slug: product.slug, href: product.href, name: product.name, tone: product.tone, price: product.price, options: product.options }}
        />
      )}
    </li>
  );
}
