"use client";

import Link from "next/link";
import { useState } from "react";
import { GlobeIcon, HeartIcon, LeafIcon, SunIcon } from "./icons";
import CategoryNav from "./CategoryNav";
import ProductCard, { type CardProduct } from "./ProductCard";

type Props = {
  category: { slug: string; name: string };
  products: CardProduct[];
  categories: { slug: string; name: string; count: number }[];
};

type Sort = "featured" | "az" | "za";

const VALUES = [
  { Icon: LeafIcon, label: "Thoughtful design" },
  { Icon: SunIcon, label: "A brighter tomorrow" },
  { Icon: GlobeIcon, label: "Good people" },
  { Icon: HeartIcon, label: "Higher standards" },
];

// The same page in every theme. The theme CSS moves the pieces around:
// a sidebar or a row of tabs, a banner or a title block, tiles or cards.
export default function CategoryView({ category, products, categories }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("featured");

  const q = query.trim().toLowerCase();
  const filtered = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  const shown =
    sort === "featured"
      ? filtered
      : [...filtered].sort((a, b) => a.name.localeCompare(b.name) * (sort === "az" ? 1 : -1));

  return (
    <div className="cp">
      <section className="cp-hero" aria-labelledby="cp-title">
        <div className="cp-hero-copy">
          <p className="cp-crumb">Shop</p>
          <h1 id="cp-title" className="cp-title">
            {category.name}
          </h1>
          <p className="cp-tag">Good tools. Brighter days.</p>
          <p className="cp-lede">{products.length} products</p>
          <Link href="/shop" className="cp-cta">
            All categories
          </Link>
        </div>
      </section>

      <div className="cp-body">
        <aside className="cp-side" aria-label="Browse">
          <CategoryNav categories={categories} currentSlug={category.slug} />
        </aside>

        <div className="cp-main">
          <div className="cp-toolbar">
            <label className="cp-search">
              <span className="sr-only">Search {category.name}</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${category.name.toLowerCase()}`}
              />
            </label>
            <p className="cp-count" aria-live="polite">
              {q ? `${shown.length} of ${products.length} products` : `${products.length} products`}
            </p>
            <label className="cp-sort">
              <span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="featured">Featured</option>
                <option value="az">Name, A to Z</option>
                <option value="za">Name, Z to A</option>
              </select>
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="cp-empty">
              No product matches &ldquo;{query}&rdquo;. Try a shorter word, or clear the search.
            </p>
          ) : (
            <ul className="cp-grid">
              {shown.map((p) => (
                <ProductCard key={p.href} product={p} />
              ))}
            </ul>
          )}

          <ul className="cp-values" aria-label="What we stand for">
            {VALUES.map(({ Icon, label }) => (
              <li key={label}>
                <Icon />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
