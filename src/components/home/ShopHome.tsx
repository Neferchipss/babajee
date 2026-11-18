"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { listCollections } from "@/lib/collections";
import { bestSellerSlugs, blocks, inline, listRows, liveBanners, type Banner, type Design, type HomeSection } from "@/lib/content";
import { formatPrice } from "@/lib/currency";
import CategoryIcon from "@/components/CategoryIcon";
import type { HomeProduct } from "@/lib/catalog-db";
import "./designs.css";
import "./shop-home.css";

// The shop's home for every design but Current (Admin > Storefront, 0073):
// rotating banners, the sections the admin arranged (categories, best
// sellers, new arrivals, a collection, a category, a few words), and a way
// into the painted shop (Explore the shop, /explore). Made to feel like a
// home rather than a catalogue: warm colours, room to breathe, slow
// banners, a welcome, and somewhere to sit down (the sections read like
// rooms).
const DEFAULT_SECTIONS: HomeSection[] = (["banners", "categories", "best_sellers", "new_arrivals"] as const).map((kind, i) => ({
  id: kind,
  kind,
  title: ["", "Shop by category", "Best sellers", "New arrivals"][i],
  body: "",
  ref: "",
  item_count: 8,
  position: i,
  is_visible: true,
}));

const WELCOME: Record<Exclude<Design, "current">, { kicker: string; line: string }> = {
  shopfront: { kicker: "Babajee · the smoke shop", line: "Everything for the roll, the session and the shelf. Delivered across India." },
  haveli: { kicker: "Aaiye, baithiye", line: "Come in, take your shoes off, look around. The family shop, now at your door." },
  chai: { kicker: "Pull up a chair", line: "No rush here. Put the kettle on and browse like you would at the counter." },
  courtyard: { kicker: "Step into the courtyard", line: "Open, airy and easy to wander. Everything in its place, nothing in a hurry." },
};

export default function ShopHome({ design, products, categories }: { design: Exclude<Design, "current">; products: HomeProduct[]; categories: { slug: string; name: string; count: number }[] }) {
  const [sections, setSections] = useState<HomeSection[]>(DEFAULT_SECTIONS);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [best, setBest] = useState<string[]>([]);
  const [cols, setCols] = useState<Map<string, { name: string; tagline: string; slugs: string[] }>>(new Map());

  useEffect(() => {
    listRows("home_sections").then((s) => {
      const shown = s.filter((x) => x.is_visible).sort((a, b) => a.position - b.position);
      if (shown.length) setSections(shown);
    });
    liveBanners().then((b) => setBanners(b.sort((a, c) => a.position - c.position)));
    bestSellerSlugs(24).then(setBest);
    listCollections().then(
      (l) => setCols(new Map(l.filter((c) => c.is_visible).map((c) => [c.slug, { name: c.name, tagline: c.tagline, slugs: c.product_slugs }]))),
      () => {},
    );
  }, []);

  const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);
  // priced products, the photographed ones first
  const withPhoto = useMemo(() => products.filter((p) => p.price !== undefined && p.price > 0).sort((a, b) => Number(!!b.image) - Number(!!a.image)), [products]);
  const pick = (slugs: string[], n: number) => slugs.map((s) => bySlug.get(s)).filter((p): p is HomeProduct => !!p && p.price !== undefined).slice(0, n);
  const welcome = WELCOME[design];

  return (
    <div className="shh" data-design={design}>
      {sections.map((s) => {
        switch (s.kind) {
          case "banners":
            return <Banners key={s.id} banners={banners} welcome={welcome} />;
          case "categories":
            return <Categories key={s.id} title={s.title} categories={categories} />;
          case "best_sellers": {
            // the real best sellers; until there are enough, photographed
            // products spread across the categories fill in
            const real = pick(best, s.item_count);
            const fill = spread(withPhoto, s.item_count).filter((p) => !real.includes(p));
            return <Row key={s.id} title={s.title || "Best sellers"} items={[...real, ...fill].slice(0, s.item_count)} href="/shop/" />;
          }
          case "new_arrivals": {
            const fresh = withPhoto
              .filter((p) => p.added)
              .sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""))
              .slice(0, s.item_count);
            return <Row key={s.id} title={s.title || "New arrivals"} items={fresh} href="/shop/" />;
          }
          case "collection": {
            const c = cols.get(s.ref);
            if (!c) return null;
            return <Row key={s.id} title={s.title || c.name} sub={c.tagline} items={pick(c.slugs, s.item_count)} href={`/shop/collection/${s.ref}/`} />;
          }
          case "category": {
            const cat = categories.find((c) => c.slug === s.ref);
            if (!cat) return null;
            return <Row key={s.id} title={s.title || cat.name} items={withPhoto.filter((p) => p.cat === s.ref).slice(0, s.item_count)} href={`/shop/${s.ref}/`} />;
          }
          case "text":
            return s.body.trim() ? (
              <section key={s.id} className="shh-words">
                {s.title && <h2>{s.title}</h2>}
                <RichText body={s.body} />
              </section>
            ) : null;
          default:
            return null;
        }
      })}

      <section className="shh-explore">
        <div>
          <p className="shh-kicker">Not in a hurry?</p>
          <h2>Walk into the shop</h2>
          <p>Wander the painted shop like you&apos;re standing at the counter: shelves, jars and all.</p>
        </div>
        <Link className="shh-btn" href="/explore/">
          Explore the shop
        </Link>
      </section>
    </div>
  );
}

// a few from each category in turn, so a fresh shop still looks lived-in
function spread(list: HomeProduct[], n: number): HomeProduct[] {
  const by = new Map<string, HomeProduct[]>();
  for (const p of list) by.set(p.cat, [...(by.get(p.cat) ?? []), p]);
  const out: HomeProduct[] = [];
  for (let i = 0; out.length < n && i < 50; i++) for (const l of by.values()) if (l[i] && out.length < n) out.push(l[i]);
  return out;
}

function Banners({ banners, welcome }: { banners: Banner[]; welcome: { kicker: string; line: string } }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLElement>(null);
  const n = banners.length;
  useEffect(() => {
    if (n < 2 || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setAt((i) => (i + 1) % n), 6500);
    return () => window.clearInterval(t);
  }, [n, paused]);

  if (!n)
    return (
      <section className="shh-hero shh-welcome">
        <p className="shh-kicker">{welcome.kicker}</p>
        <h1>Make yourself at home</h1>
        <p>{welcome.line}</p>
        <div className="shh-hero-actions">
          <Link className="shh-btn" href="/shop/">
            Start browsing
          </Link>
          <Link className="shh-btn ghost" href="/explore/">
            Explore the shop
          </Link>
        </div>
      </section>
    );

  const go = (i: number) => setAt((i + n) % n);
  return (
    <section
      ref={box}
      className="shh-hero shh-banners"
      aria-roledescription="carousel"
      aria-label="Highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && setPaused(false)}
    >
      <div className="shh-slides">
        {banners.map((b, i) => (
          <article
            key={b.id}
            className="shh-slide"
            data-tone={b.tone}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}`}
            aria-hidden={i !== at}
            style={{ ...(b.image_url ? { backgroundImage: `url("${b.image_url.replace(/"/g, "")}")` } : {}), transform: `translateX(${(i - at) * 100}%)` }}
          >
            <div className="shh-slide-text">
              {i === 0 ? <h1>{b.title}</h1> : <h2>{b.title}</h2>}
              {b.subtitle && <p>{b.subtitle}</p>}
              {b.link_url && b.button_label && (
                <Link className="shh-btn" href={b.link_url} tabIndex={i === at ? 0 : -1}>
                  {b.button_label}
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
      {n > 1 && (
        <div className="shh-dots">
          <button type="button" aria-label="Previous" onClick={() => go(at - 1)}>
            ‹
          </button>
          {banners.map((b, i) => (
            <button key={b.id} type="button" className={i === at ? "is-on" : ""} aria-label={`Show ${i + 1}: ${b.title}`} aria-current={i === at} onClick={() => go(i)} />
          ))}
          <button type="button" aria-label="Next" onClick={() => go(at + 1)}>
            ›
          </button>
          <button type="button" className="shh-pause" aria-label={paused ? "Play" : "Pause"} onClick={() => setPaused(!paused)}>
            {paused ? "▶" : "❚❚"}
          </button>
        </div>
      )}
    </section>
  );
}

function Categories({ title, categories }: { title: string; categories: { slug: string; name: string; count: number }[] }) {
  return (
    <section className="shh-room">
      <div className="shh-room-head">
        <h2>{title || "Shop by category"}</h2>
        <Link href="/shop/">Everything →</Link>
      </div>
      <ul className="shh-cats">
        {categories
          .filter((c) => c.count > 0)
          .map((c) => (
            <li key={c.slug}>
              <Link href={`/shop/${c.slug}/`}>
                <span className="shh-cat-img">
                  <CategoryIcon slug={c.slug} size={56} />
                </span>
                <b>{c.name}</b>
                <small>{c.count} products</small>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}

function Row({ title, sub, items, href }: { title: string; sub?: string; items: HomeProduct[]; href: string }) {
  if (!items.length) return null;
  return (
    <section className="shh-room">
      <div className="shh-room-head">
        <div>
          <h2>{title}</h2>
          {sub && <p className="shh-sub">{sub}</p>}
        </div>
        <Link href={href}>See all →</Link>
      </div>
      <ul className="shh-row">
        {items.map((p) => (
          <li key={p.slug}>
            <Link href={`/shop/${p.cat}/?p=${encodeURIComponent(p.slug)}`} className="shh-card">
              <span className="shh-card-img">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" loading="lazy" />
                ) : (
                  <span className="shh-initial" aria-hidden="true">
                    {p.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="shh-card-name">{p.name}</span>
              <span className="shh-card-price">
                {p.price !== undefined ? formatPrice(p.price) : ""}
                {p.mrp ? <s>{formatPrice(p.mrp)}</s> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RichText({ body }: { body: string }) {
  const line = (t: string) =>
    inline(t).map((x, i) =>
      x.t === "b" ? (
        <strong key={i}>{x.v}</strong>
      ) : x.t === "a" ? (
        x.href.startsWith("/") ? (
          <Link key={i} href={x.href}>
            {x.v}
          </Link>
        ) : (
          <a key={i} href={x.href} target="_blank" rel="noreferrer noopener">
            {x.v}
          </a>
        )
      ) : (
        <span key={i}>{x.v}</span>
      ),
    );
  return (
    <>
      {blocks(body).map((b, i) =>
        b.type === "h" ? (
          <h3 key={i}>{line(b.text)}</h3>
        ) : b.type === "ul" ? (
          <ul key={i}>
            {b.items.map((it, k) => (
              <li key={k}>{line(it)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{line(b.text)}</p>
        ),
      )}
    </>
  );
}

