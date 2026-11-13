"use client";

import { fullTitle, seoTitle } from "@/lib/seo";
import { useLiveCatalog } from "@/lib/useLiveCatalog";
import { photosFor } from "@/lib/product-photos";
import { toneAt } from "@/lib/tone";
import SceneLink from "@/components/SceneLink";
import { byGroup } from "@/lib/brand";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GlobeIcon, HeartIcon, LeafIcon, SearchIcon, SunIcon } from "./icons";
import CategoryNav from "./CategoryNav";
import CategorySwitch from "./CategorySwitch";
import ShelfReader from "./baba/ShelfReader";
import ShopBar from "./ShopBar";
import DaydreamBloom from "./daydream/DaydreamBloom";
import DaydreamHero from "./daydream/DaydreamHero";
import { addToCart, tossIntoJar } from "@/lib/cart";
import ProductCard, { type CardProduct } from "./ProductCard";
import ShelfFilter, { ActiveFilters, applyFilters, filterCount, NO_FILTERS, sortProducts, type Filters, type Sort } from "./ShelfFilter";
import ProductSheet from "./ProductSheet";
import ProductDesk from "./ProductDesk";
import { shelfArrived } from "@/lib/shelf-switch";

type Props = {
  category: { slug: string; name: string; tagline?: string };
  // a product's own page: the product to open on arrival
  open?: string;
  // a collection's shelf (0041): its products' slugs, in the shop's order
  pick?: string[];
  products: CardProduct[];
  categories: { slug: string; name: string; count: number }[];
};


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
// the address follows the wheel quietly: the sheet stays open either way,
// so there is no need to re-render the whole shelf behind it
const followSheet = (slug: string) => {
  if (slug !== sheetSlug()) window.history.replaceState(null, "", `?p=${encodeURIComponent(slug)}`);
};

// wide screens get the product as a full page instead of the phone's card
const DESK = "(min-width: 1024px)";
const onDeskChange = (fn: () => void) => {
  const m = window.matchMedia(DESK);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};
const isDesk = () => window.matchMedia(DESK).matches;

// the browser tab's title (kept out of the component: it writes to the page)
const setTabTitle = (t: string) => {
  document.title = t;
};

const VALUES = [
  { Icon: LeafIcon, label: "Thoughtful design" },
  { Icon: SunIcon, label: "A brighter tomorrow" },
  { Icon: GlobeIcon, label: "Good people" },
  { Icon: HeartIcon, label: "Higher standards" },
];

// The same page in every theme. The theme CSS moves the pieces around:
// a sidebar or a row of tabs, a banner or a title block, tiles or cards.
export default function CategoryView({ category, products: snapshot, categories: initialCategories, pick, open }: Props) {
  // arrived on a product's own address (/shop/grinder/rotary-missile/): it
  // opens here, and the address becomes the shelf's (/shop/grinder/?p=…) so
  // closing it leaves the shelf, as when it's opened from the shelf
  useEffect(() => {
    if (!open) return;
    const path = window.location.pathname;
    const tail = `/${open}`;
    const shelf = path.endsWith(tail) || path.endsWith(`${tail}/`) ? path.slice(0, path.lastIndexOf(tail) + 1) : path;
    window.history.replaceState(null, "", `${shelf}?p=${encodeURIComponent(open)}`);
    window.dispatchEvent(new Event(SHEET_EVENT));
  }, [open]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("featured");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // phones and tablets: the search field opens from the title bar
  const [finding, setFinding] = useState(false);

  // the search page and the all-products shelf list every product, under
  // their category; the search page takes its query from the address
  const everything = category.slug === "all" || category.slug === "search";
  const catalog = useLiveCatalog();
  const categories = catalog ? initialCategories.map((c) => ({
    ...c, count: catalog.filter((p) => p.categorySlug === c.slug).length,
  })) : initialCategories;
  // a collection lists its own products, in its order, each under its category
  const order = pick ? new Map(pick.map((s, i) => [s, i])) : null;
  const products: CardProduct[] = catalog ? catalog.filter((p) => (order ? order.has(p.slug) : everything || p.categorySlug === category.slug)).sort((a, b) => (order ? order.get(a.slug)! - order.get(b.slug)! : 0)).map((p) => ({
    href: `/shop/${p.categorySlug}?p=${encodeURIComponent(p.slug)}`, slug: p.slug, name: p.name,
    options: Math.max(0, p.variantCount - 1), price: p.minPrice, mrp: p.mrp, variants: p.variants,
    images: photosFor(p.slug), tone: toneAt(Math.max(0, categories.findIndex((c) => c.slug === p.categorySlug))),
    group: everything || order ? p.categoryName : undefined,
    sub: p.subcategory,
    brand: p.brand, added: p.added,
  })) : snapshot;
  // the switched-on collections, listed under the categories (live: a new
  // one shows without the site being rebuilt)
  const [collections, setCollections] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    import("@/lib/collections")
      .then((m) => m.listCollections())
      .then((l) => live && setCollections(l.filter((c) => c.is_visible).map(({ slug, name }) => ({ slug, name }))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // subcategory chips: on a category's own shelf, when its products carry them
  const [sub, setSub] = useState("");
  const subs = everything || order ? [] : [...new Set(products.map((p) => p.sub).filter((x): x is string => !!x))];
  const searching = category.slug === "search";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query in the address, once
    if (searching) setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
  }, [searching]);

  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const inSub = sub && subs.includes(sub) ? products.filter((p) => p.sub === sub) : products;
  const searched = words.length
    ? inSub.filter((p) => words.every((w) => `${p.name} ${p.group ?? ""} ${p.sub ?? ""}`.toLowerCase().includes(w)))
    : inSub;
  // then Sort & filter's choices
  const filtered = applyFilters(searched, filters);
  const narrowed = q !== "" || filterCount(filters) > 0;
  const sortFilter = { products: searched, sort, onSort: setSort, filters, onFilters: setFilters };
  // Featured on the all-products shelf lists it category by category, under
  // a heading for each; a category's own shelf is one run of cards (the
  // brand is on each card)
  const brands = sort === "featured" && everything ? byGroup(filtered) : null;
  const shown = brands
    ? brands.flatMap((g) => g.items)
    : sort === "featured"
      ? filtered
      : sortProducts(filtered, sort);

  // a few of the shelf's own products, for the search bar to suggest
  const hints = products.slice(0, 8).map((p) => p.name);

  const openSlug = useSyncExternalStore(onSheet, sheetSlug, () => null);
  const desk = useSyncExternalStore(onDeskChange, isDesk, () => false);
  const sheetItems = shown.filter((p) => p.slug && p.variants);
  const openAt = openSlug ? sheetItems.findIndex((p) => p.slug === openSlug) : -1;

  // the browser tab names the open product, as its own address would; back
  // to the shelf's title when the sheet closes
  const shelfTitle = useRef<string | null>(null);
  const openItem = openAt >= 0 ? sheetItems[openAt] : null;
  const ownTitle = openItem ? snapshot.find((p) => p.slug === openItem.slug)?.seoTitle : undefined;
  const tabTitle = openItem ? fullTitle(seoTitle({ name: openItem.name, category: openItem.group ?? category.name, seoTitle: ownTitle })) : null;
  useEffect(() => {
    // arrived on a product's own page, the tab starts with the product's
    // title: the shelf's is its category's
    shelfTitle.current ??= open ? fullTitle(category.name) : document.title;
    setTabTitle(tabTitle ?? shelfTitle.current);
  }, [tabTitle, open, category.name]);

  // this shelf is on screen: the one it replaced stops dimming
  useEffect(() => shelfArrived(), [category.slug]);

  return (
    <div className="cp">
      <section className="cp-hero" aria-labelledby="cp-title">
        <ShopBar
          current={category.slug}
          categories={categories}
          tools={<ShelfFilter {...sortFilter} className="sb-sort" />}
          hints={hints}
          catalog={catalog}
          {...(searching ? { query, onQuery: setQuery } : {})}
        />
        {/* phones and tablets: the masthead is a compact title bar */}
        <SceneLink href="/shop" className="cp-bar-btn cp-back" aria-label="All categories">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </SceneLink>
        <div className="cp-hero-copy">
          <p className="cp-crumb">
            <span className="dd-crumb-plain">Shop</span>
            <span className="dd-crumb">The Babajee field guide</span>
          </p>
          <h1 id="cp-title" className="cp-title">
            <CategorySwitch current={category} categories={categories} />
          </h1>
          <p className="cp-tag">Good tools. Brighter days.</p>
          <p className="cp-lede">{products.length} products</p>
          <SceneLink href="/shop" className="cp-cta">
            All categories
          </SceneLink>
        </div>
        <div className="cp-bar-tools">
          <ShelfFilter {...sortFilter} className="cp-bar-btn cp-bar-sort" />
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
      </section>

      <div className="cp-body">
        <aside className="cp-side" aria-label="Browse">
          <CategoryNav categories={categories} currentSlug={category.slug} collections={collections} />
        </aside>

        <div className="cp-main">
          {/* the shelf's header: how many, the name, its line (on phones the
              name is already in the bar above, so just the line and count) */}
          <header className="cp-head">
            <p className="cp-head-count">
              {narrowed ? `${shown.length} of ` : ""}
              {products.length} product{products.length === 1 ? "" : "s"}
            </p>
            <h2 className="cp-head-name">{category.name}</h2>
            {category.tagline ? <p className="cp-head-line">{category.tagline}</p> : null}
          </header>
          {subs.length > 0 && (
            <div className="cp-subs" role="group" aria-label={`Filter ${category.name}`}>
              {["", ...subs].map((s) => (
                <button key={s || "all"} type="button" aria-pressed={sub === s || (!s && !subs.includes(sub))} onClick={() => setSub(s)}>
                  {s || "All"}
                  <span>{s ? products.filter((p) => p.sub === s).length : products.length}</span>
                </button>
              ))}
            </div>
          )}
          <ActiveFilters filters={filters} onFilters={setFilters} sort={sort} onSort={setSort} />
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
              {narrowed ? `${shown.length} of ${products.length} products` : `${products.length} products`}
            </p>
            <ShelfFilter {...sortFilter} className="cp-sort" label />
          </div>

          {order && !catalog ? null : shown.length === 0 ? (
            <p className="cp-empty">
              {q ? (
                <>No product matches &ldquo;{query}&rdquo;. Try a shorter word, or clear the search.</>
              ) : (
                "Nothing here yet."
              )}
            </p>
          ) : (
            <ul className="cp-grid">
              {(brands ?? [{ brand: undefined, items: shown }]).map((g) => [
                brands && (
                  <li key={`brand-${g.brand ?? ""}`} className="cp-brand">
                    <h2>{g.brand ?? "More"}</h2>
                    <span>{g.items.length}</span>
                  </li>
                ),
                ...g.items.map((p) => (
                  <ProductCard
                    key={p.href}
                    product={p}
                    onOpen={p.slug && p.variants ? () => openSheet(p.slug!) : undefined}
                    onAdd={
                      p.slug && p.variants?.length === 1
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
                )),
              ])}
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

      {openAt >= 0 &&
        (() => {
          const props = {
            products: sheetItems.map((p) => ({ slug: p.slug!, href: p.href, name: p.name, tone: p.tone, variants: p.variants!, unit: p.unit, group: p.group, mrp: p.mrp })),
            start: openAt,
            category: category.name,
            onIndex: followSheet,
            onClose: closeSheet,
          };
          // a wide screen gets a full product page; a phone the swipeable card
          return desk ? <ProductDesk key={`desk-${category.slug}`} {...props} /> : <ProductSheet key={category.slug} {...props} />;
        })()}
    </div>
  );
}
