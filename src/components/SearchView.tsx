"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toneAt } from "@/lib/tone";
import ProductCard from "./ProductCard";

const LIMIT = 60;

export type SearchEntry = {
  href: string;
  name: string;
  options: number;
  price: number;
  categoryIndex: number;
  haystack: string;
};

// Search across the whole catalogue. Uses the same cards as the category
// pages, so it takes on whichever theme is active. The list itself is
// fetched once on the server (src/app/shop/search/page.tsx) and passed in.
export default function SearchView({ entries }: { entries: SearchEntry[] }) {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const q = query.trim().toLowerCase();
  const matches = q ? entries.filter((p) => p.haystack.includes(q)) : [];

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
                <ProductCard
                  key={p.href}
                  product={{ href: p.href, name: p.name, options: p.options, price: p.price, tone: toneAt(p.categoryIndex) }}
                />
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
