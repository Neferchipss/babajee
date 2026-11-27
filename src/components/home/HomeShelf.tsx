"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { bestSellerSlugs } from "@/lib/content";
import { dealFor } from "@/lib/deal";
import { formatPrice } from "@/lib/currency";
import { thumb } from "@/lib/product-photos";
import CategoryIcon from "@/components/CategoryIcon";
import { isSoldOut } from "@/components/SoldOutRow";
import type { CardProduct } from "@/components/ProductCard";
import "./home-shelf.css";

// The shop's home (/shop, the All tab), where the 3D shop drops you off.
// Every other page is the same shelf grid; this one breaks it, as the
// quick-commerce homes do: a dark block with the hero artwork and every
// category as a tile, then deals and a few rows to swipe along, each
// heading trailing a dashed rule. A search or a filter turns it back into the full
// all-products shelf (CategoryView).

const ROW = 10;
// categories that get a row of their own at the end
const CAT_ROWS = 3;

type Cat = { slug: string; name: string; count: number };

export default function HomeShelf({
  products,
  categories,
  card,
  onOpen,
}: {
  products: CardProduct[];
  categories: Cat[];
  // the shelf's own card, with its open and quick-add wired up
  card: (p: CardProduct) => ReactNode;
  onOpen: (slug: string) => void;
}) {
  const [best, setBest] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    bestSellerSlugs(24).then((s) => live && setBest(s), () => {});
    return () => {
      live = false;
    };
  }, []);

  // what can be bought now, the photographed first
  const ready = useMemo(
    () => products.filter((p) => p.price !== undefined && p.price > 0 && !isSoldOut(p)).sort((a, b) => Number(!!b.images?.length) - Number(!!a.images?.length)),
    [products],
  );
  const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);
  const own = useMemo(() => {
    const m = new Map<string, CardProduct[]>();
    for (const p of products) m.set(p.group ?? "", [...(m.get(p.group ?? "") ?? []), p]);
    return m;
  }, [products]);
  const stocked = categories.filter((c) => own.get(c.name)?.length);
  // biggest first, for the band and the rows
  const big = [...stocked].sort((a, b) => (own.get(b.name)?.length ?? 0) - (own.get(a.name)?.length ?? 0));

  // best sellers: the real ones, topped up with one from each category in
  // turn until there are enough sales to fill the row
  const bestRow = useMemo(() => {
    const real = best.map((s) => bySlug.get(s)).filter((p): p is CardProduct => !!p && ready.includes(p));
    const fill = spread(ready, ROW).filter((p) => !real.includes(p));
    return [...real, ...fill].slice(0, ROW);
  }, [best, bySlug, ready]);
  const deals = useMemo(
    () =>
      ready
        .filter((p) => dealFor(p.price, p.mrp))
        .sort((a, b) => (b.mrp! - b.price!) / b.mrp! - (a.mrp! - a.price!) / a.mrp!)
        .slice(0, ROW),
    [ready],
  );
  const fresh = useMemo(() => ready.filter((p) => p.added).sort((a, b) => (b.added ?? "").localeCompare(a.added ?? "")).slice(0, ROW), [ready]);
  const photosOf = (c: Cat, n: number) =>
    (own.get(c.name) ?? [])
      .filter((p) => p.images?.length)
      .slice(0, n)
      .map((p) => thumb(p.images![0]))
      .filter((s): s is string => !!s);

  return (
    <div className="hh">
      <Band hero={bestRow.find((p) => p.images?.length) ?? bestRow[0]} categories={big} own={own} photosOf={photosOf} onOpen={onOpen} />

      <Row title="Deals" items={deals} card={card} variant="deals" />
      <Row title="Best sellers" items={bestRow} card={card} />

      <Row title="New arrivals" items={fresh} card={card} />
      {big.slice(0, CAT_ROWS).map((c) => {
        const list = own.get(c.name) ?? [];
        const items = [...list.filter((p) => ready.includes(p)), ...list.filter((p) => !ready.includes(p))].slice(0, ROW);
        return <Row key={c.slug} title={c.name} href={`/shop/${c.slug}/`} count={list.length} items={items} card={card} />;
      })}
    </div>
  );
}

// The band: a dark block across the top of the page, the hero artwork
// first, then the tiles. A tall tile on the left holds
// one product (the top seller) with its price; beside it every category as a
// cream tile, two rows of them swiped sideways: the name on top, a few of its
// products cut out, and a ribbon along the bottom with its lowest price.
function Band({
  hero,
  categories,
  own,
  photosOf,
  onOpen,
}: {
  hero?: CardProduct;
  categories: Cat[];
  own: Map<string, CardProduct[]>;
  photosOf: (c: Cat, n: number) => string[];
  onOpen: (slug: string) => void;
}) {
  if (!categories.length) return null;
  const deal = hero ? dealFor(hero.price, hero.mrp) : null;
  const heroPhoto = hero?.images?.[0] ? thumb(hero.images[0]) : undefined;
  return (
    <section className="hh-band" aria-label="Shop by category">
      {/* the shop's hero artwork, where the quick-commerce apps put their sale */}
      <div className="hh-art" role="img" aria-label="Babajee: a cosmic beach, a sun with an eye setting into the waves" />
      <ul className="hh-band-grid">
        {hero && hero.slug && (
          <li className="hh-hero">
            <Link
              href={hero.href}
              className="hh-hero-in"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onOpen(hero.slug!);
              }}
            >
              <span className="hh-hero-kick">Top pick</span>
              <span className="hh-pill">
                {deal && <s>{formatPrice(deal.mrp)}</s>}
                <b>{formatPrice(hero.price)}</b>
              </span>
              {heroPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroPhoto} alt="" className="hh-hero-img" loading="lazy" draggable={false} />
              ) : (
                <span className="hh-hero-img" />
              )}
              <span className="hh-hero-name">{hero.name}</span>
            </Link>
          </li>
        )}
        {categories.map((c) => {
          const list = own.get(c.name) ?? [];
          const prices = list.map((p) => p.price).filter((n): n is number => n !== undefined && n > 0);
          const from = prices.length ? Math.min(...prices) : undefined;
          return (
            <li key={c.slug} className="hh-cat">
              <Link href={`/shop/${c.slug}/`} className="hh-cat-in">
                <span className="hh-cat-name">{c.name}</span>
                <Cutouts srcs={photosOf(c, 2)} slug={c.slug} />
                <span className="hh-ribbon">{from !== undefined ? `From ${formatPrice(from)}` : `${list.length} to see`}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Head({ title }: { title: string }) {
  return (
    <header className="hh-head">
      <h2>{title}</h2>
    </header>
  );
}

// a category's products, cut out, standing up out of the top of its tile
function Cutouts({ srcs, slug }: { srcs: string[]; slug: string }) {
  // no photos yet: the category's own icon, big, in the shop's colour
  if (!srcs.length)
    return (
      <span className="hh-cut hh-cut--icon" aria-hidden="true">
        <CategoryIcon slug={slug} size={56} />
      </span>
    );
  return (
    <span className="hh-cut" data-n={srcs.length} aria-hidden="true">
      {srcs.map((s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={s} src={s} alt="" loading="lazy" draggable={false} />
      ))}
    </span>
  );
}

function Row({ title, items, href, count, card, variant }: { title: string; items: CardProduct[]; href?: string; count?: number; card: (p: CardProduct) => ReactNode; variant?: "deals" }) {
  if (!items.length) return null;
  return (
    <section className="hh-sec" data-variant={variant}>
      <Head title={title} />
      {/* a new list (the best sellers arriving) is a new row: scroll snap
          would otherwise follow the first card to its new place */}
      <ul key={items.map((p) => p.href).join(" ")} className="cp-grid hh-row">
        {items.map(card)}
      </ul>
      {href && (
        <Link href={href} className="hh-seeall">
          See all{count ? ` ${count}` : ""}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 4l10 8-10 8z" />
          </svg>
        </Link>
      )}
    </section>
  );
}

// n products taking one from each category in turn
function spread(list: CardProduct[], n: number) {
  const groups = new Map<string, CardProduct[]>();
  for (const p of list) {
    const k = p.group ?? "";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out: CardProduct[] = [];
  const queues = [...groups.values()];
  for (let i = 0; out.length < n && queues.some((q) => q.length > i); i++) for (const q of queues) if (q[i] && out.length < n) out.push(q[i]);
  return out;
}
