"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardProduct } from "./ProductCard";
import "./shelf-filter.css";
import { useFocusTrap } from "@/lib/use-focus-trap";

// Sort & filter for a shelf: one button (next to the search), opening a
// panel: a dropdown on a wide screen, a sheet from the bottom on a phone.
// Every choice applies at once; each option says how many products it would
// leave, and the panel closes on "Show N products". The shelf lists what's
// on as chips above the products (ActiveFilters), each one tap to remove.

export type Sort = "featured" | "price-asc" | "price-desc" | "discount" | "new" | "az" | "za";
export const SORTS: { id: Sort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "discount", label: "Biggest discount" },
  { id: "new", label: "Newest" },
  { id: "az", label: "Name: A to Z" },
  { id: "za", label: "Name: Z to A" },
];

export type Filters = { prices: string[]; stock: boolean; sale: boolean; brands: string[]; cats: string[] };
export const NO_FILTERS: Filters = { prices: [], stock: false, sale: false, brands: [], cats: [] };

const BANDS = [
  { id: "u300", label: "Under ₹300", test: (p: number) => p < 300 },
  { id: "300", label: "₹300 – ₹699", test: (p: number) => p >= 300 && p < 700 },
  { id: "700", label: "₹700 – ₹1,499", test: (p: number) => p >= 700 && p < 1500 },
  { id: "1500", label: "₹1,500 and up", test: (p: number) => p >= 1500 },
];

const inStock = (p: CardProduct) => !p.variants || p.variants.some((v) => v.stockQty > 0);
const onSale = (p: CardProduct) => !!p.price && !!p.mrp && p.mrp > p.price;
const off = (p: CardProduct) => (onSale(p) ? (p.mrp! - p.price!) / p.mrp! : 0);

// the products that pass every filter (but one, to count that one's options)
export function applyFilters(list: CardProduct[], f: Filters, skip?: keyof Filters) {
  return list.filter(
    (p) =>
      (skip === "prices" || !f.prices.length || (!!p.price && BANDS.some((b) => f.prices.includes(b.id) && b.test(p.price!)))) &&
      (skip === "stock" || !f.stock || inStock(p)) &&
      (skip === "sale" || !f.sale || onSale(p)) &&
      (skip === "brands" || !f.brands.length || (!!p.brand && f.brands.includes(p.brand))) &&
      (skip === "cats" || !f.cats.length || (!!p.group && f.cats.includes(p.group))),
  );
}

// a product with no price yet sorts after the priced ones either way
export function sortProducts(list: CardProduct[], sort: Sort) {
  const by = (fn: (a: CardProduct, b: CardProduct) => number) => [...list].sort(fn);
  const price = (dir: number) => (a: CardProduct, b: CardProduct) => (a.price ? (b.price ? (a.price - b.price) * dir : -1) : b.price ? 1 : 0);
  switch (sort) {
    case "price-asc":
      return by(price(1));
    case "price-desc":
      return by(price(-1));
    case "discount":
      return by((a, b) => off(b) - off(a));
    case "new":
      return by((a, b) => (b.added ?? "").localeCompare(a.added ?? ""));
    case "az":
      return by((a, b) => a.name.localeCompare(b.name));
    case "za":
      return by((a, b) => b.name.localeCompare(a.name));
    default:
      return list;
  }
}

export const filterCount = (f: Filters) => f.prices.length + f.brands.length + f.cats.length + (f.stock ? 1 : 0) + (f.sale ? 1 : 0);

// what's on, as removable chips: [label, the filters without it]
export function activeChips(f: Filters): [string, Filters][] {
  return [
    ...f.prices.map((id): [string, Filters] => [BANDS.find((b) => b.id === id)?.label ?? id, { ...f, prices: f.prices.filter((x) => x !== id) }]),
    ...(f.stock ? [["In stock", { ...f, stock: false }] as [string, Filters]] : []),
    ...(f.sale ? [["On sale", { ...f, sale: false }] as [string, Filters]] : []),
    ...f.brands.map((b): [string, Filters] => [b, { ...f, brands: f.brands.filter((x) => x !== b) }]),
    ...f.cats.map((c): [string, Filters] => [c, { ...f, cats: f.cats.filter((x) => x !== c) }]),
  ];
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const Icon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export default function ShelfFilter({
  products,
  sort,
  onSort,
  filters,
  onFilters,
  className,
  label,
}: {
  // the shelf's products before these filters (after its search and chips)
  products: CardProduct[];
  sort: Sort;
  onSort: (s: Sort) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  className?: string;
  // show the words "Sort & filter" beside the icon
  label?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  useFocusTrap(panel, open, { initial: "first" });

  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    setAt(r ? { top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) } : null);
    setOpen(true);
  };

  const n = filterCount(filters);
  const result = applyFilters(products, filters).length;
  const count = (skip: keyof Filters, test: (p: CardProduct) => boolean) => applyFilters(products, filters, skip).filter(test).length;
  const brands = [...new Set(products.map((p) => p.brand).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b));
  const cats = [...new Set(products.map((p) => p.group).filter((c): c is string => !!c))];
  const hasSale = products.some(onSale);

  const chip = (on: boolean, text: string, k: number, act: () => void, key: string) => (
    <button key={key} type="button" className="sf-chip" aria-pressed={on} disabled={!on && k === 0} onClick={act}>
      {text}
      <small>{k}</small>
    </button>
  );

  const host = typeof document === "undefined" ? null : (document.getElementById("site") ?? document.body);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`sf-btn ${className ?? ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Sort and filter${n ? `, ${n} filter${n === 1 ? "" : "s"} on` : ""}`}
        title="Sort and filter"
        onClick={() => (open ? setOpen(false) : show())}
      >
        <Icon />
        {label && <span className="sf-btn-text">Sort &amp; filter</span>}
        {n > 0 ? <b className="sf-badge">{n}</b> : sort !== "featured" ? <i className="sf-dot" aria-hidden="true" /> : null}
      </button>
      {open &&
        host &&
        createPortal(
          <div className="sf-layer">
            <div className="sf-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
            <div ref={panel} className="sf-panel" role="dialog" aria-modal="true" aria-label="Sort and filter" tabIndex={-1} style={at ? ({ "--sf-top": `${at.top}px`, "--sf-right": `${at.right}px` } as React.CSSProperties) : undefined}>
              <header className="sf-head">
                <h2>Sort &amp; filter</h2>
                <button type="button" className="sf-x" aria-label="Close" onClick={() => setOpen(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </header>

              <div className="sf-body">
                <section>
                  <h3>Sort by</h3>
                  <div className="sf-sorts" role="radiogroup" aria-label="Sort by">
                    {SORTS.filter((s) => s.id !== "discount" || hasSale).map((s) => (
                      <button key={s.id} type="button" role="radio" aria-checked={sort === s.id} className="sf-sort" onClick={() => onSort(s.id)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3>Price</h3>
                  <div className="sf-chips">
                    {BANDS.map((b) =>
                      chip(filters.prices.includes(b.id), b.label, count("prices", (p) => !!p.price && b.test(p.price)), () => onFilters({ ...filters, prices: toggle(filters.prices, b.id) }), b.id),
                    )}
                  </div>
                </section>

                <section>
                  <h3>Show only</h3>
                  <div className="sf-chips">
                    {chip(filters.stock, "In stock", count("stock", inStock), () => onFilters({ ...filters, stock: !filters.stock }), "stock")}
                    {hasSale && chip(filters.sale, "On sale", count("sale", onSale), () => onFilters({ ...filters, sale: !filters.sale }), "sale")}
                  </div>
                </section>

                {cats.length > 1 && (
                  <section>
                    <h3>Category</h3>
                    <div className="sf-chips">
                      {cats.map((c) => chip(filters.cats.includes(c), c, count("cats", (p) => p.group === c), () => onFilters({ ...filters, cats: toggle(filters.cats, c) }), c))}
                    </div>
                  </section>
                )}

                {brands.length > 1 && (
                  <section>
                    <h3>Brand</h3>
                    <div className="sf-chips">
                      {brands.map((b) => chip(filters.brands.includes(b), b, count("brands", (p) => p.brand === b), () => onFilters({ ...filters, brands: toggle(filters.brands, b) }), b))}
                    </div>
                  </section>
                )}
              </div>

              <footer className="sf-foot">
                <button type="button" className="sf-clear" disabled={!n && sort === "featured"} onClick={() => (onFilters(NO_FILTERS), onSort("featured"))}>
                  Clear all
                </button>
                <button type="button" className="sf-go" onClick={() => setOpen(false)}>
                  {result ? `Show ${result} product${result === 1 ? "" : "s"}` : "No products match"}
                </button>
              </footer>
            </div>
          </div>,
          host,
        )}
    </>
  );
}

// The filters that are on, above the products: each removes with a tap.
export function ActiveFilters({ filters, onFilters, sort, onSort }: { filters: Filters; onFilters: (f: Filters) => void; sort: Sort; onSort: (s: Sort) => void }) {
  const chips = activeChips(filters);
  if (!chips.length && sort === "featured") return null;
  return (
    <div className="sf-active" role="group" aria-label="Sort and filters on">
      {sort !== "featured" && (
        <button type="button" onClick={() => onSort("featured")} aria-label={`Sorted by ${SORTS.find((s) => s.id === sort)?.label}: back to Featured`}>
          {SORTS.find((s) => s.id === sort)?.label}
          <span aria-hidden="true">×</span>
        </button>
      )}
      {chips.map(([text, without]) => (
        <button key={text} type="button" onClick={() => onFilters(without)} aria-label={`Remove ${text}`}>
          {text}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      {chips.length + (sort !== "featured" ? 1 : 0) > 1 && (
        <button type="button" className="sf-active-clear" onClick={() => (onFilters(NO_FILTERS), onSort("featured"))}>
          Clear all
        </button>
      )}
    </div>
  );
}
