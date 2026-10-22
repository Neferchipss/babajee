"use client";

import Link from "next/link";
import { addToCart, tossIntoJar } from "@/lib/cart";
import { unsave, useSaved } from "@/lib/wishlist";
import Price from "./Price";
import ProductArt from "./ProductArt";

// Everything hearted, under the cart: open it, move it into the jar, or let
// it go. Products with options open their page to choose one.
export default function SavedList() {
  const saved = useSaved();
  if (saved.length === 0) return null;
  return (
    <section className="saved mt-10" aria-labelledby="saved-title">
      <h2 id="saved-title" className="text-2xl">
        Saved for later <span className="text-base text-muted">({saved.length})</span>
      </h2>
      <ul className="saved-list mt-5">
        {saved.map((it) => (
          <li key={it.slug} className="saved-item">
            <Link href={it.href} className="saved-link">
              <ProductArt name={it.name} tone={it.tone} className="saved-art" />
              <Price className="saved-price" value={it.price} />
              <span className="saved-name">{it.name}</span>
            </Link>
            <div className="saved-actions">
              {it.options ? (
                <Link href={it.href} className="saved-add">
                  Choose option
                </Link>
              ) : (
                <button
                  type="button"
                  className="saved-add"
                  onClick={(e) => {
                    addToCart({ slug: it.slug, href: it.href, name: it.name, tone: it.tone, variant: "Standard", price: it.price });
                    tossIntoJar(e.currentTarget.closest(".saved-item")?.querySelector(".pa") ?? null);
                    unsave(it.slug);
                  }}
                >
                  Add
                </button>
              )}
              <button type="button" className="saved-remove" onClick={() => unsave(it.slug)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
