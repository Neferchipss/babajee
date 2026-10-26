"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { addToCart, tossIntoJar, useCart } from "@/lib/cart";
import ProductCard, { type CardProduct } from "./ProductCard";

export type RecGroup = { title: string; products: CardProduct[] };

// Things to add on the cart page, in one panel: tabs along the top ("Did you
// forget?", then a few categories) over a row of shelf tiles that scrolls
// sideways, leaving out what is already in the jar. A single-option product
// drops straight in; one with options opens its page to choose.
export default function CartRecs({ groups }: { groups: RecGroup[] }) {
  const cart = useCart();
  const inCart = new Set(cart.map((l) => l.slug));
  const tabs = groups
    .map((g) => ({ ...g, products: g.products.filter((p) => p.slug && !inCart.has(p.slug)).slice(0, 10) }))
    .filter((g) => g.products.length > 0);
  const [pick, setPick] = useState(0);
  const [dir, setDir] = useState<"next" | "prev" | "">("");
  const bar = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLSpanElement>(null);
  const on = Math.min(pick, Math.max(tabs.length - 1, 0));

  // the underline slides under the picked tab, which glides into view
  useLayoutEffect(() => {
    const box = bar.current;
    const i = ink.current;
    const tab = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !i || !tab) return;
    // the first time it just sits there
    if (!i.style.width) i.style.transition = "none";
    i.style.transform = `translateX(${tab.offsetLeft}px)`;
    i.style.width = `${tab.offsetWidth}px`;
    void i.offsetWidth;
    i.style.transition = "";
    box.scrollTo({ left: tab.offsetLeft - (box.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [on, tabs.length]);

  if (tabs.length === 0) return null;

  return (
    <section className="cv-recs" aria-label="Add more">
      <div ref={bar} className="cv-tabs" role="tablist">
        <span ref={ink} className="cv-ink" aria-hidden="true" />
        {tabs.map((g, i) => (
          <button
            key={g.title}
            type="button"
            role="tab"
            id={`cv-tab-${i}`}
            aria-selected={i === on}
            aria-controls="cv-recs-row"
            className="cv-tab"
            onClick={() => {
              if (i === on) return;
              try {
                navigator.vibrate?.(6);
              } catch {}
              setDir(i > on ? "next" : "prev");
              setPick(i);
            }}
          >
            {g.title}
          </button>
        ))}
      </div>
      <ul key={on} id="cv-recs-row" className="cp-grid" data-dir={dir || undefined} role="tabpanel" aria-labelledby={`cv-tab-${on}`}>
        {tabs[on].products.map((p) => (
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
