"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CATEGORIES } from "@/lib/catalog-data";
import { toneAt } from "@/lib/tone";
import { displayName } from "@/lib/variants";
import ProductCard from "./ProductCard";

const LIMIT = 60;

const ALL = CATEGORIES.flatMap((c, i) =>
  c.products.map((p) => ({
    href: `/shop/${c.slug}/${p.slug}`,
    name: displayName(p),
    options: p.variants.length,
    tone: toneAt(i),
    haystack: `${displayName(p)} ${c.name}`.toLowerCase(),
  })),
);

// Search across the whole catalogue. Uses the same cards as the category
// pages, so it takes on whichever theme is active.
export default function SearchView() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const q = query.trim().toLowerCase();
  const matches = q ? ALL.filter((p) => p.haystack.includes(q)) : [];

  return (
    <div className="cp cp--search">
      <section className="cp-hero" aria-labelledby="cp-title">
        <div className="cp-hero-copy">
          <p className="cp-crumb">Shop</p>
          <h1 id="cp-title" className="cp-title">
            Search
          </h1>
          <p className="cp-tag">Good tools. Brighter days.</p>
        </div>
      </section>

      <div className="cp-body">
        <div className="cp-main">
          <label className="cp-search cp-search--wide">
            <span className="sr-only">Search the shop</span>
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all products"
            />
          </label>

          <div className="cp-toolbar">
            <p className="cp-count" aria-live="polite">
              {q ? `${matches.length} ${matches.length === 1 ? "product" : "products"}` : "Type to search"}
            </p>
          </div>

          {q && matches.length === 0 ? (
            <p className="cp-empty">
              No product matches &ldquo;{query}&rdquo;. Try a shorter word, or browse the categories.
            </p>
          ) : (
            <ul className="cp-grid">
              {matches.slice(0, LIMIT).map((p) => (
                <ProductCard key={p.href} product={p} />
              ))}
            </ul>
          )}
          {matches.length > LIMIT && (
            <p className="cp-empty">Showing the first {LIMIT}. Add a word to narrow it down.</p>
          )}
        </div>
      </div>
    </div>
  );
}
