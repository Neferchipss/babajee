"use client";

import { addToCart, tossIntoJar, useCart } from "@/lib/cart";
import ProductCard, { type CardProduct } from "./ProductCard";

// "You might also like" on the cart page: shelf tiles in a row that scrolls
// sideways, leaving out what is already in the jar. A single-option product
// drops straight in; one with options opens its page to choose.
export default function CartRecs({ products }: { products: CardProduct[] }) {
  const cart = useCart();
  const inCart = new Set(cart.map((l) => l.slug));
  const shown = products.filter((p) => p.slug && !inCart.has(p.slug)).slice(0, 10);
  if (shown.length === 0) return null;
  return (
    <section className="cv-recs" aria-labelledby="cv-recs-title">
      <h2 id="cv-recs-title" className="cv-recs-title">
        You might also like
      </h2>
      <ul className="cp-grid">
        {shown.map((p) => (
          <ProductCard
            key={p.slug}
            product={p}
            onAdd={(from) => {
              const v = p.variants?.[0];
              addToCart({ slug: p.slug!, href: p.href, name: p.name, tone: p.tone, variant: v?.label ?? "Standard", price: v?.price, unit: p.unit });
              tossIntoJar(from);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
