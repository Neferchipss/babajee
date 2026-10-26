"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { suggest } from "@/lib/search-index";
import Branded from "./Branded";
import CategoryIcon from "./CategoryIcon";
import { SearchIcon } from "./icons";
import Logo from "./Logo";
import DeliverTo from "./address/DeliverTo";
import ProfileMenu from "./ProfileMenu";
import "./shop-bar.css";

type Sort = "featured" | "az" | "za";

// Each category is its own page, so the strip is built afresh on every tap.
// What it looked like as the old page went (scrolled where, the underline
// where, which tab) is kept here, and the new strip carries on from it: the
// underline slides over and the strip glides the new tab to the middle.
type Carry = { left: number; x: number; w: number; from: number; t: number };
let carry: Carry | null = null;
// note where the strip is (scroll, underline) as its page goes
function remember(list: HTMLElement, ink: HTMLElement, from: number) {
  const box = list.getBoundingClientRect();
  const r = ink.getBoundingClientRect();
  if (!r.width) return;
  carry = { left: list.scrollLeft, x: r.left - box.left + list.scrollLeft, w: r.width, from, t: Date.now() };
}
const buzz = () => {
  try {
    navigator.vibrate?.(6);
  } catch {}
};
// the underline, under a tab (or where it was)
function inkAt(i: HTMLElement, x: number, w: number, animate: boolean) {
  i.style.transition = animate ? "" : "none";
  i.style.transform = `translateX(${x}px)`;
  i.style.width = `${w}px`;
  if (!animate) {
    void i.offsetWidth;
    i.style.transition = "";
  }
}
const inkUnder = (i: HTMLElement, el: HTMLElement, animate: boolean) =>
  inkAt(i, el.offsetLeft + 10, el.offsetWidth - 20, animate);
const centre = (list: HTMLElement, el: HTMLElement) => el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;

// The shelf's header on phones, after the quick-commerce apps: where it is
// delivering to and the profile button, then the search bar and the strip
// of categories. Scrolled down, the search bar and the strip stay.
export default function ShopBar({
  current,
  categories,
  sort,
  onSort,
  hints,
  query: shared,
  onQuery,
}: {
  current: string;
  categories: { slug: string; name: string }[];
  sort: Sort;
  onSort: (s: Sort) => void;
  // product names the placeholder cycles through ("Search "alien grinder"")
  hints: string[];
  // On the search page the bar filters that page as you type (it holds every
  // product); elsewhere it suggests products as you type, and Enter goes to
  // the search page.
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const router = useRouter();
  const [own, setOwn] = useState("");
  const live = onQuery !== undefined;
  const query = live ? (shared ?? "") : own;
  const setQuery = live ? onQuery : setOwn;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(-1);
  const found = live || !open ? [] : suggest(query);
  const go = (href: string) => {
    setOpen(false);
    // the product's own shelf opens it in the sheet; when that is this
    // shelf, open the sheet the way a tap on a card does
    const [path, qs] = href.split("?");
    if (path === window.location.pathname.replace(/\/$/, "") || path + "/" === window.location.pathname) {
      window.history.pushState(null, "", `?${qs}`);
      window.dispatchEvent(new Event("bb:sheet"));
    } else router.push(href);
  };
  const strip = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLFormElement>(null);

  // Scrolled down, the search bar and the categories under it stay: the
  // header (sticky in the theme) is lifted by everything above the search,
  // measured, since the address row's height varies on the phone.
  useEffect(() => {
    const form = search.current;
    const host = form?.closest<HTMLElement>(".cp-hero");
    if (!form || !host) return;
    // where it pins: under the site header where that stays on screen
    // (desktop), at the very top where it gives way (phones)
    const hdr = document.querySelector<HTMLElement>(".hdr");
    const lift = () => {
      host.style.setProperty("--sb-lift", `${form.offsetTop}px`);
      const pinned = hdr && hdr.offsetHeight > 0 && getComputedStyle(hdr).position === "sticky";
      const head = pinned ? (parseFloat(getComputedStyle(hdr).top) || 0) + hdr.offsetHeight : 0;
      host.style.setProperty("--sb-head", `${head}px`);
    };
    lift();
    const ro = new ResizeObserver(lift);
    ro.observe(form.parentElement!);
    if (hdr) ro.observe(hdr);
    return () => ro.disconnect();
  }, []);
  const hint = useHint(hints);

  // scrolled down the shelf: on wide screens the categories fold away and
  // the top row stays as a bar (phones lift the header instead, in CSS)
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const check = () => {
      const down = window.scrollY > 90;
      if ((el.dataset.compact === "true") !== down) el.dataset.compact = String(down);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  // the tab tapped: lit at once, before its page arrives
  const [pending, setPending] = useState<string | null>(null);
  const active = pending ?? current;
  const pendingRef = useRef<string | null>(null);
  const ink = useRef<HTMLLIElement>(null);
  const list = [{ slug: "all", name: "All" }, ...categories];

  // arriving: carry on from the old strip, or just sit on the current tab
  useLayoutEffect(() => {
    const el = strip.current;
    const i = ink.current;
    const cur = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !i || !cur) return;
    const from = carry && Date.now() - carry.t < 5000 ? carry : null;
    carry = null;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from && !still) {
      el.scrollLeft = from.left;
      inkAt(i, from.x, from.w, false);
      // which way the shelf came from, for the cards sliding in
      const to = list.findIndex((c) => c.slug === current);
      document.documentElement.dataset.bbSlide = to >= from.from ? "next" : "prev";
      window.setTimeout(() => delete document.documentElement.dataset.bbSlide, 450);
      requestAnimationFrame(() => {
        inkUnder(i, cur, true);
        el.scrollTo({ left: centre(el, cur), behavior: "smooth" });
      });
    } else {
      el.scrollLeft = centre(el, cur);
      inkUnder(i, cur, false);
    }
    // leaving: note where everything is, mid-slide or not
    return () => remember(el, i, list.findIndex((c) => c.slug === current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per category
  }, [current]);

  // the underline follows the strip's size (fonts, rotation)
  useEffect(() => {
    const el = strip.current;
    const i = ink.current;
    if (!el || !i) return;
    const ro = new ResizeObserver(() => {
      const on = el.querySelector<HTMLElement>(`[data-slug="${pendingRef.current ?? current}"]`);
      if (on) inkUnder(i, on, false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [current]);

  const tap = (slug: string, el: HTMLElement) => {
    if (slug === active) return;
    buzz();
    pendingRef.current = slug;
    setPending(slug);
    const box = strip.current;
    const i = ink.current;
    if (!box || !i) return;
    // where things were, in case the old strip goes before it can say
    remember(box, i, list.findIndex((c) => c.slug === current));
    inkUnder(i, el, true);
    box.scrollTo({ left: centre(box, el), behavior: "smooth" });
  };

  // which ends of the strip have more to scroll to (an arrow sits over each
  // such end on wide screens)
  const [ends, setEnds] = useState({ prev: false, next: false });
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const prev = el.scrollLeft > 2;
      const next = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
      setEnds((e) => (e.prev === prev && e.next === next ? e : { prev, next }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);
  const nudge = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div ref={bar} className="sb">
      <div className="sb-top">
        {/* wide screens: the logo first, as the site header had it */}
        <Link href="/" className="sb-logo" aria-label="Babajee home">
          <Logo className="w-[150px]" priority />
        </Link>
        <DeliverTo />
        <ProfileMenu />
      </div>


      <form
        ref={search}
        className="sb-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const chosen = found[pick];
          if (chosen) return go(`/shop/${chosen.categorySlug}?p=${encodeURIComponent(chosen.slug)}`);
          const q = query.trim();
          setOpen(false);
          (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
          if (!q) return;
          const url = `/shop/search?q=${encodeURIComponent(q)}`;
          if (live) router.replace(url, { scroll: false });
          else router.push(url);
        }}
      >
        <SearchIcon size={20} className="sb-search-ico" />
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setPick(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (!found.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
            e.preventDefault();
            // through the suggestions and "see all", round again at either end
            const n = found.length + 1;
            setPick((i) => (e.key === "ArrowDown" ? (i + 1) % n : (Math.max(i, 0) - 1 + n) % n));
          }}
          role="combobox"
          aria-expanded={found.length > 0}
          aria-controls="sb-found"
          aria-autocomplete="list"
          aria-label="Search the shop"
          placeholder={hint ? `Search "${hint.toLowerCase()}"` : "Search"}
        />
        {found.length > 0 && (
          <ul id="sb-found" className="sb-found" role="listbox">
            {found.map((s, i) => (
              <li key={s.slug} role="option" aria-selected={i === pick}>
                <a
                  href={`/shop/${s.categorySlug}?p=${encodeURIComponent(s.slug)}`}
                  onMouseDown={(e) => e.preventDefault() /* keep the field focused until the tap lands */}
                  onClick={(e) => {
                    e.preventDefault();
                    go(`/shop/${s.categorySlug}?p=${encodeURIComponent(s.slug)}`);
                  }}
                >
                  <span className="sb-found-pic">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.photo ? <img src={s.photo} alt="" loading="lazy" /> : s.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="sb-found-name">
                    <Branded name={s.name} />
                  </span>
                  <span className="sb-found-cat">{s.category}</span>
                </a>
              </li>
            ))}
            <li role="option" aria-selected={pick === found.length}>
              <button type="submit" className="sb-found-all">
                See all results for &ldquo;{query.trim()}&rdquo;
              </button>
            </li>
          </ul>
        )}
        <label className="sb-sort" title="Sort">
          <span className="sr-only">Sort</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />
          </svg>
          <select value={sort} onChange={(e) => onSort(e.target.value as Sort)}>
            <option value="featured">Featured</option>
            <option value="az">Name, A to Z</option>
            <option value="za">Name, Z to A</option>
          </select>
        </label>
      </form>

      <nav aria-label="Categories" className="sb-nav">
        {ends.prev && (
          <button type="button" className="sb-cats-btn" data-dir="-1" aria-label="More categories" tabIndex={-1} onClick={() => nudge(-1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        {ends.next && (
          <button type="button" className="sb-cats-btn" data-dir="1" aria-label="More categories" tabIndex={-1} onClick={() => nudge(1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <ul ref={strip} className="sb-cats">
          <li ref={ink} className="sb-ink" role="presentation" aria-hidden="true" />
          {list.map((c) => (
            <li key={c.slug}>
              <Link
                href={c.slug === "all" ? "/shop" : `/shop/${c.slug}`}
                className="sb-cat"
                data-slug={c.slug}
                data-on={c.slug === active || undefined}
                aria-current={c.slug === current ? "page" : undefined}
                onClick={(e) => tap(c.slug, e.currentTarget)}
              >
                <CategoryIcon slug={c.slug} size={26} />
                <span>{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

// a product name to suggest, changing every few seconds
function useHint(hints: string[]) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (hints.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % hints.length), 2600);
    return () => window.clearInterval(t);
  }, [hints.length]);
  return hints[i % Math.max(1, hints.length)];
}

