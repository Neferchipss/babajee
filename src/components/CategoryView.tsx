"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToCart, tossIntoJar } from "@/lib/cart";
import { useState, useSyncExternalStore } from "react";
import { GlobeIcon, HeartIcon, LeafIcon, SearchIcon, SunIcon } from "./icons";
import CategoryNav from "./CategoryNav";
import ShelfReader from "./baba/ShelfReader";
import ThirdEye from "./baba/ThirdEye";
import DaydreamBloom from "./daydream/DaydreamBloom";
import DaydreamHero from "./daydream/DaydreamHero";
import ProductCard, { type CardProduct } from "./ProductCard";
import ProductSheet from "./ProductSheet";

type Props = {
  category: { slug: string; name: string };
  products: CardProduct[];
  categories: { slug: string; name: string; count: number }[];
};

type Sort = "featured" | "az" | "za";

// The open product lives in the address (?p=slug), so the back button puts
// the sheet away and a link can open it. Next keeps pushState in step with
// its router; it fires no event for it, so the sheet tells this store itself.
const SHEET_EVENT = "bb:sheet";
const sheetSlug = () => new URLSearchParams(window.location.search).get("p");
const onSheet = (fn: () => void) => {
  window.addEventListener("popstate", fn);
  window.addEventListener(SHEET_EVENT, fn);
  return () => {
    window.removeEventListener("popstate", fn);
    window.removeEventListener(SHEET_EVENT, fn);
  };
};
const setSheet = (slug: string | null, push: boolean) => {
  const url = slug ? `?p=${encodeURIComponent(slug)}` : window.location.pathname;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(SHEET_EVENT));
};
// opened from the shelf: back undoes the push. Opened from a link: there is
// nothing of ours to go back to, so just drop ?p from the address.
let pushedSheet = false;
const openSheet = (slug: string) => {
  pushedSheet = true;
  setSheet(slug, true);
};
const closeSheet = () => {
  if (pushedSheet) {
    pushedSheet = false;
    window.history.back();
  } else setSheet(null, false);
};
// ?p=_first opens the category's first product (a category chip in the
// sheet lands here without knowing the slugs of the next category)
const FIRST = "_first";
// switching category from the sheet replaces the entry: nothing to go back to
const forgetPush = () => {
  pushedSheet = false;
};
// the address follows the wheel quietly: the sheet stays open either way,
// so there is no need to re-render the whole shelf behind it
const followSheet = (slug: string) => {
  if (slug !== sheetSlug()) window.history.replaceState(null, "", `?p=${encodeURIComponent(slug)}`);
};

const VALUES = [
  { Icon: LeafIcon, label: "Thoughtful design" },
  { Icon: SunIcon, label: "A brighter tomorrow" },
  { Icon: GlobeIcon, label: "Good people" },
  { Icon: HeartIcon, label: "Higher standards" },
];

// The same page in every theme. The theme CSS moves the pieces around:
// a sidebar or a row of tabs, a banner or a title block, tiles or cards.
export default function CategoryView({ category, products, categories }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("featured");
  // phones and tablets: the search field opens from the title bar
  const [finding, setFinding] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  const shown =
    sort === "featured"
      ? filtered
      : [...filtered].sort((a, b) => a.name.localeCompare(b.name) * (sort === "az" ? 1 : -1));

  const openSlug = useSyncExternalStore(onSheet, sheetSlug, () => null);
  const sheetItems = shown.filter((p) => p.slug && p.variants);
  const openAt = openSlug === FIRST ? 0 : openSlug ? sheetItems.findIndex((p) => p.slug === openSlug) : -1;
  // a category chip in the sheet: the same sheet, on that category's wheel.
  // It replaces this entry, so putting the sheet away leaves you on that
  // category's shelf.
  const switchCategory = (slug: string) => {
    if (slug === category.slug) return;
    forgetPush();
    router.replace(`/shop/${slug}?p=${FIRST}`, { scroll: true });
  };

  return (
    <div className="cp">
      <section className="cp-hero" aria-labelledby="cp-title">
        {/* phones and tablets: the masthead is a compact title bar */}
        <Link href="/shop" className="cp-bar-btn cp-back" aria-label="All categories">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="cp-hero-copy">
          <p className="cp-crumb">
            <span className="dd-crumb-plain">Shop</span>
            <span className="dd-crumb">The Babajee field guide</span>
          </p>
          <h1 id="cp-title" className="cp-title">
            {category.name}
          </h1>
          <p className="cp-tag">Good tools. Brighter days.</p>
          <p className="cp-lede">{products.length} products</p>
          <Link href="/shop" className="cp-cta">
            All categories
          </Link>
        </div>
        <div className="cp-bar-tools">
          <label className="cp-bar-btn cp-bar-sort">
            <span className="sr-only">Sort</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />
            </svg>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="featured">Featured</option>
              <option value="az">Name, A to Z</option>
              <option value="za">Name, Z to A</option>
            </select>
          </label>
          <button
            type="button"
            className="cp-bar-btn"
            aria-label={finding ? "Close search" : `Search ${category.name}`}
            aria-expanded={finding}
            onClick={() => {
              const open = !finding;
              setFinding(open);
              if (!open) setQuery("");
              else window.setTimeout(() => document.querySelector<HTMLInputElement>(".cp-search input")?.focus(), 0);
            }}
          >
            <SearchIcon size={20} />
          </button>
        </div>
        <DaydreamHero />
        <ThirdEye products={products} />
      </section>

      <div className="cp-body">
        <aside className="cp-side" aria-label="Browse">
          <CategoryNav categories={categories} currentSlug={category.slug} />
        </aside>

        <div className="cp-main">
          <div className="cp-toolbar" data-open={finding || q !== ""}>
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
                <ProductCard
                  key={p.href}
                  product={p}
                  onOpen={p.slug && p.variants ? () => openSheet(p.slug!) : undefined}
                  onAdd={
                    p.slug && p.variants?.length === 1 && p.variants[0].stockQty > 0
                      ? (from) => {
                          const v = p.variants![0];
                          addToCart({ slug: p.slug!, href: p.href, name: p.name, tone: p.tone, variant: v.label, price: v.price, unit: p.unit });
                          tossIntoJar(from);
                          try {
                            navigator.vibrate?.([10, 40, 10]);
                          } catch {}
                        }
                      : undefined
                  }
                />
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

        <DaydreamBloom />
      </div>

      <ShelfReader />

      {openAt >= 0 && (
        <ProductSheet
          key={category.slug}
          products={sheetItems.map((p) => ({ slug: p.slug!, href: p.href, name: p.name, tone: p.tone, variants: p.variants!, unit: p.unit }))}
          start={openAt}
          category={category.name}
          categories={categories}
          categorySlug={category.slug}
          onCategory={switchCategory}
          onIndex={followSheet}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
