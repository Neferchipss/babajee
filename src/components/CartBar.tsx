"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cartSums, LANDED_EVENT, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/currency";
import { photosFor } from "@/lib/product-photos";
import "./cart-bar.css";

// "View cart", floating at the bottom of the page once something is in the
// cart, as the quick-commerce apps do: the last few things added, how many
// and the total, one tap to the cart. With no cart button in the header,
// this and the profile screen's Your cart tile are the way to it. A product added from a card
// flies into it, and it gives a little bump when it lands. Out of the way
// while a product is open over the shelf (it has its own Add), and not on
// the cart or checkout themselves.
export default function CartBar() {
  const path = usePathname().replace(/\/$/, "") || "/";
  const cart = useCart();
  const { count, total } = cartSums(cart);
  const onShelf = path === "/shop" || path.startsWith("/shop/");
  const away = path === "/" || /^\/(cart|checkout|admin|pitch|styles)(\/|$)/.test(path);
  const show = !away && count > 0;

  // the store button beside it folds to its icon while this shows
  useEffect(() => {
    const root = document.documentElement;
    if (show) root.dataset.cartbar = "";
    else delete root.dataset.cartbar;
    return () => {
      delete root.dataset.cartbar;
    };
  }, [show]);

  const [bump, setBump] = useState(0);
  useEffect(() => {
    const landed = () => setBump((b) => b + 1);
    window.addEventListener(LANDED_EVENT, landed);
    return () => window.removeEventListener(LANDED_EVENT, landed);
  }, []);

  if (!show) return null;
  // the last things added, newest in front
  const recent = [...cart].reverse().filter((l, i, all) => all.findIndex((x) => x.slug === l.slug) === i).slice(0, 3);

  return (
    <Link key={bump} href="/cart" className={`cbar${onShelf ? " cbar--shelf" : ""}`} data-jar="bar" data-bump={bump > 0 || undefined} aria-label={`View cart: ${count} item${count === 1 ? "" : "s"}${total !== undefined ? `, ${formatPrice(total)}` : ""}`}>
      <span className="cbar-pics" aria-hidden="true">
        {recent.map((l) => {
          const photo = photosFor(l.slug, l.variant)[0] ?? photosFor(l.slug)[0];
          return (
            <span key={l.slug} className="cbar-pic" style={{ background: photo ? undefined : l.tone }}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" />
              ) : (
                l.name.slice(0, 1)
              )}
            </span>
          );
        })}
      </span>
      <span className="cbar-text">
        <b>View cart</b>
        <small>
          {count} item{count === 1 ? "" : "s"}
          {total !== undefined && total > 0 ? ` · ${formatPrice(total)}` : ""}
        </small>
      </span>
      <span className="cbar-go" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </Link>
  );
}
