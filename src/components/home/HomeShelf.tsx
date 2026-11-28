"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { bestSellerSlugs } from "@/lib/content";
import { dealFor } from "@/lib/deal";
import { formatPrice } from "@/lib/currency";
import { thumb } from "@/lib/product-photos";
import { addToCart, tossIntoJar } from "@/lib/cart";
import { buzz } from "@/lib/buzz";
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

// The wide-screen home comes in two looks: "bento" (a grid of coloured
// tiles, the one in use) and "poster" (the poster beside two spotlights, a
// rail of round tiles and two promos). ?desk=poster or ?desk=bento in the
// address shows the other one, to compare.
type Desk = "bento" | "poster";
const DESK: Desk = "bento";
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
  const [desk, setDesk] = useState<Desk>(DESK);
  useEffect(() => {
    const asked = new URLSearchParams(location.search).get("desk");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
    if (asked === "bento" || asked === "poster") setDesk(asked);
  }, []);
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
  const hero = bestRow.find((p) => p.images?.length) ?? bestRow[0];
  // the newest with a photo, for the poster's second spotlight
  const justIn = [...fresh, ...bestRow].find((p) => p.images?.length && p !== hero);
  const photosOf = (c: Cat, n: number) =>
    (own.get(c.name) ?? [])
      .filter((p) => p.images?.length)
      .slice(0, n)
      .map((p) => thumb(p.images![0]))
      .filter((s): s is string => !!s);

  return (
    <div className="hh">
      {/* phones: the band; wide screens: the poster, the rail and the promos */}
      <Band hero={hero} categories={big} own={own} photosOf={photosOf} onOpen={onOpen} />
      {desk === "poster" ? (
        <>
          <Poster hero={hero} justIn={justIn} onOpen={onOpen} />
          <Rail categories={big} own={own} photosOf={photosOf} />
        </>
      ) : (
        <Bento hero={hero} categories={big} own={own} photosOf={photosOf} onOpen={onOpen} />
      )}

      <Row title="Deals" items={deals} card={card} variant="deals" />
      <Row id="hh-best" title="Best sellers" items={bestRow} card={card} />
      {desk === "poster" && <Promos categories={big} own={own} photosOf={photosOf} />}

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
      <div className="hh-top">
        {/* wide screens: the shop says what it is in the band's open sky */}
        <div className="hh-intro">
          <span className="hh-intro-kick">Babajee · The smoke shop</span>
          <strong className="hh-intro-h">Papers, trays, glass and everything that goes with them</strong>
          <span className="hh-intro-p">Delivered across India. {categories.length} categories, open below.</span>
        </div>
        <div className="hh-art" role="img" aria-label="Babajee: a cosmic beach, a sun with an eye setting into the waves" />
      </div>
      <Scroller label="categories" className="hh-band-grid" dep={categories.length}>
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
          return (
            <li key={c.slug} className="hh-cat">
              <Link href={`/shop/${c.slug}/`} className="hh-cat-in">
                <span className="hh-cat-name">{c.name}</span>
                <Cutouts srcs={photosOf(c, 2)} slug={c.slug} />
                <span className="hh-ribbon">{ribbon(own.get(c.name) ?? [])}</span>
              </Link>
            </li>
          );
        })}
      </Scroller>
    </section>
  );
}

// "From ₹250", or how many there are when nothing has a price yet
function ribbon(list: CardProduct[]) {
  const prices = list.map((p) => p.price).filter((n): n is number => n !== undefined && n > 0);
  return prices.length ? `From ${formatPrice(Math.min(...prices))}` : `${list.length} to see`;
}

// a product's own link that opens its sheet on a plain click
function openProps(p: CardProduct, onOpen: (slug: string) => void) {
  return {
    href: p.href,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !p.slug) return;
      e.preventDefault();
      onOpen(p.slug);
    },
  };
}

// Wide screens, the bento: one grid of tiles in the shop's four colours
// (cream, the hot red, the bar's yellow, black). The artwork and the top
// pick take the two big blocks; the ten biggest categories fill tiles of
// three widths, one of them a wide one with a button; the rest of the
// categories follow as chips.
const BENTO = 10;
// each tile's width (of 12 columns) and colour, in order
const TILES: { span: 3 | 4 | 6; tone: "cream" | "hot" | "bar" | "ink"; wide?: true }[] = [
  { span: 3, tone: "cream" },
  { span: 3, tone: "hot" },
  { span: 6, tone: "bar", wide: true },
  { span: 4, tone: "cream" },
  { span: 4, tone: "ink" },
  { span: 4, tone: "cream" },
  { span: 3, tone: "cream" },
  { span: 3, tone: "hot" },
  { span: 3, tone: "cream" },
  { span: 3, tone: "ink" },
];
function Bento({
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
  // the wide tile shows its products big: give it a category with photos
  const first = categories.slice(0, BENTO);
  const wideAt = TILES.findIndex((t) => t.wide);
  const pictured = first.findIndex((c, i) => i >= wideAt && photosOf(c, 1).length);
  if (pictured > wideAt) [first[wideAt], first[pictured]] = [first[pictured], first[wideAt]];
  const rest = categories.slice(BENTO);
  const photo = hero?.images?.[0] ? thumb(hero.images[0]) : undefined;
  const one = hero?.slug && hero.variants?.length === 1 ? hero.variants[0] : undefined;
  return (
    <>
      <section className="hh-desk hh-bento" aria-label="Shop by category">
        <div className="hh-bt hh-bt-art">
          <span className="hh-kick">Babajee · The smoke shop</span>
          <strong className="hh-bt-h">
            <span>Everything for the session</span>
          </strong>
          <a href="#hh-best" className="hh-btn hh-btn--dk">
            Shop best sellers <span aria-hidden="true">→</span>
          </a>
        </div>
        {hero && (
          <div className="hh-bt hh-bt-pick">
            <Link {...openProps(hero, onOpen)} className="hh-bt-pick-words">
              <span className="hh-kick">Top pick this week</span>
              <b className="hh-bt-pick-name">{hero.name}</b>
              {hero.price ? <span className="hh-bt-pick-pill">{formatPrice(hero.price)}</span> : null}
            </Link>
            {/* a link styled as the button (as the shop's other buttons
                here): it adds a one-option product, else opens it */}
            <a
              href={hero.href}
              role="button"
              className="hh-btn hh-btn--lt hh-bt-pick-add"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                if (!one || !hero.slug) return hero.slug && onOpen(hero.slug);
                addToCart({ slug: hero.slug, href: hero.href, name: hero.name, tone: hero.tone, variant: one.label, price: one.price, unit: hero.unit });
                tossIntoJar(e.currentTarget);
                buzz([10, 40, 10]);
              }}
            >
              {one ? "Add to cart" : "Choose options"}
            </a>
            <Link {...openProps(hero, onOpen)} className="hh-bt-pick-img" tabIndex={-1} aria-hidden="true">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" draggable={false} />
              ) : null}
            </Link>
          </div>
        )}
        {first.map((c, i) => {
          const t = TILES[i] ?? TILES[TILES.length - 1];
          const list = own.get(c.name) ?? [];
          return (
            <Link key={c.slug} href={`/shop/${c.slug}/`} className="hh-bt hh-bt-cat" data-span={t.span} data-tone={t.tone} data-wide={t.wide}>
              <span className="hh-bt-words">
                <b className="hh-bt-name">{c.name}</b>
                <span className="hh-bt-meta">{ribbon(list)}</span>
                {t.wide && (
                  <span className="hh-btn hh-btn--dk">
                    Shop {c.name.toLowerCase()} <span aria-hidden="true">→</span>
                  </span>
                )}
              </span>
              <Cutouts srcs={photosOf(c, 2)} slug={c.slug} />
            </Link>
          );
        })}
      </section>
      {rest.length > 0 && (
        <ul className="hh-desk hh-chips" aria-label="More categories">
          {rest.map((c) => {
            const r = ribbon(own.get(c.name) ?? []);
            return (
              <li key={c.slug}>
                <Link href={`/shop/${c.slug}/`} className="hh-chip">
                  <CategoryIcon slug={c.slug} size={20} />
                  {c.name}
                  <em>{r.replace(" to see", "")}</em>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// Wide screens: the poster. The hero artwork on the shop's yellow with its
// line and the two ways in; beside it two products in their own spotlights,
// the top pick and the newest.
function Poster({ hero, justIn, onOpen }: { hero?: CardProduct; justIn?: CardProduct; onOpen: (slug: string) => void }) {
  return (
    <section className="hh-desk hh-poster-row" aria-label="Babajee">
      <div className="hh-poster">
        <span className="hh-kick">Babajee · The smoke shop</span>
        <strong className="hh-poster-h">Everything that goes with the smoke</strong>
        <span className="hh-poster-p">Papers, trays, glass and grinders, delivered across India.</span>
        <div className="hh-poster-cta">
          <a href="#hh-best" className="hh-btn hh-btn--dk">
            Shop best sellers <span aria-hidden="true">→</span>
          </a>
          <a href="#hh-cats" className="hh-btn hh-btn--lt">
            All categories
          </a>
        </div>
      </div>
      <div className="hh-spots">
        {hero && <Spot p={hero} kick="Top pick" onOpen={onOpen} />}
        {justIn && <Spot p={justIn} kick="Just in" tone="hot" onOpen={onOpen} />}
      </div>
    </section>
  );
}

function Spot({ p, kick, tone, onOpen }: { p: CardProduct; kick: string; tone?: "hot"; onOpen: (slug: string) => void }) {
  const photo = p.images?.[0] ? thumb(p.images[0]) : undefined;
  return (
    <Link {...openProps(p, onOpen)} className="hh-spot" data-tone={tone}>
      <span className="hh-spot-words">
        <span className="hh-kick">{kick}</span>
        <b className="hh-spot-name">{p.name}</b>
        {p.price ? <span className="hh-spot-pill">{formatPrice(p.price)}</span> : null}
      </span>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="hh-spot-img" draggable={false} />
      ) : (
        <span className="hh-spot-img" />
      )}
    </Link>
  );
}

// Wide screens: the categories in one line of round tiles, biggest first;
// the last opens out into all of them.
const RAIL = 10;
function Rail({ categories, own, photosOf }: { categories: Cat[]; own: Map<string, CardProduct[]>; photosOf: (c: Cat, n: number) => string[] }) {
  const [all, setAll] = useState(false);
  if (!categories.length) return null;
  const rest = categories.length - RAIL;
  const shown = all || rest <= 0 ? categories : categories.slice(0, RAIL);
  return (
    <section id="hh-cats" className="hh-desk hh-sec">
      <Head title="Shop by category" />
      <ul className="hh-rail">
        {shown.map((c) => (
          <li key={c.slug}>
            <Link href={`/shop/${c.slug}/`} className="hh-rc">
              <span className="hh-disc">
                <Cutouts srcs={photosOf(c, 2)} slug={c.slug} />
              </span>
              <span className="hh-rc-name">{c.name}</span>
              <span className="hh-rc-meta">{ribbon(own.get(c.name) ?? [])}</span>
            </Link>
          </li>
        ))}
        {rest > 0 && (
          <li>
            <button type="button" className="hh-rc hh-rc--more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              <span className="hh-disc">{all ? "−" : `+${rest}`}</span>
              <span className="hh-rc-name">{all ? "Fewer" : `All ${categories.length}`}</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

// Wide screens: two categories as big panels, each with its line and a way
// in. Rolling trays and grinders when the shop has them, else the two
// biggest with photos.
const PROMO_LINES: Record<string, string> = {
  "rolling-tray": "Roll on something worth looking at",
  grinder: "Grinders with a face on them",
};
function Promos({ categories, own, photosOf }: { categories: Cat[]; own: Map<string, CardProduct[]>; photosOf: (c: Cat, n: number) => string[] }) {
  const pictured = categories.filter((c) => photosOf(c, 1).length);
  const named = Object.keys(PROMO_LINES)
    .map((slug) => pictured.find((c) => c.slug === slug))
    .filter((c): c is Cat => !!c);
  const two = [...named, ...pictured.filter((c) => !named.includes(c))].slice(0, 2);
  if (two.length < 2) return null;
  return (
    <section className="hh-desk hh-promos">
      {two.map((c, i) => {
        const list = own.get(c.name) ?? [];
        const from = ribbon(list);
        return (
          <Link key={c.slug} href={`/shop/${c.slug}/`} className="hh-promo" data-tone={i === 0 ? "dark" : "bar"}>
            <span className="hh-kick">{c.name}</span>
            <b className="hh-promo-h">{PROMO_LINES[c.slug] ?? `${list.length} ${c.name.toLowerCase()} to choose from`}</b>
            <span className={`hh-btn ${i === 0 ? "hh-btn--lt" : "hh-btn--dk"}`}>
              {from.startsWith("From") ? from : `Shop ${c.name.toLowerCase()}`} <span aria-hidden="true">→</span>
            </span>
            <Cutouts srcs={photosOf(c, 2)} slug={c.slug} />
          </Link>
        );
      })}
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

function Row({ id, title, items, href, count, card, variant }: { id?: string; title: string; items: CardProduct[]; href?: string; count?: number; card: (p: CardProduct) => ReactNode; variant?: "deals" }) {
  if (!items.length) return null;
  return (
    <section id={id} className="hh-sec" data-variant={variant}>
      <Head title={title} />
      {/* a new list (the best sellers arriving) is a new row: scroll snap
          would otherwise follow the first card to its new place */}
      <Scroller key={items.map((p) => p.href).join(" ")} label={title} className="cp-grid hh-row">
        {items.map(card)}
      </Scroller>
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

// A swiped strip (a <ul>). On a phone it is only that; with a mouse, a
// round button at each end moves it a screenful, and goes once the strip is
// at that end.
function Scroller({ label, className, dep, children }: { label: string; className: string; dep?: unknown; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  return (
    <div className="hh-scroll">
      <ul ref={list} className={className}>
        {children}
      </ul>
      <Arrows list={list} label={label} dep={dep} />
    </div>
  );
}

function Arrows({ list, label, dep }: { list: RefObject<HTMLUListElement | null>; label: string; dep?: unknown }) {
  const [ends, setEnds] = useState({ start: true, end: true });
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const look = () => setEnds({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    look();
    el.addEventListener("scroll", look, { passive: true });
    const ro = new ResizeObserver(look);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", look);
      ro.disconnect();
    };
  }, [list, dep]);
  const go = (dir: number) => {
    const el = list.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };
  return (
    <>
      <button type="button" className="hh-arrow" data-dir="back" hidden={ends.start} onClick={() => go(-1)} aria-label={`Back through ${label}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <button type="button" className="hh-arrow" data-dir="next" hidden={ends.end} onClick={() => go(1)} aria-label={`More ${label}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </>
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
