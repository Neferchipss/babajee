"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { suggest } from "@/lib/search-index";
import Branded from "./Branded";
import CategoryIcon from "./CategoryIcon";
import { SearchIcon, UserIcon } from "./icons";
import "./shop-bar.css";

type Sort = "featured" | "az" | "za";

// The shelf's header on phones, after the quick-commerce apps: where it is
// delivering to and the profile button, then the strip of categories and a
// search bar. Scrolled down, only the search bar stays.
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

  // Scrolled down, only the search bar stays: the header (sticky in the
  // theme) is lifted by everything above the search, measured, since the
  // strip's height depends on the font and the address on the phone.
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

  // the current category in view in the strip
  useEffect(() => {
    const list = strip.current;
    const cur = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !cur) return;
    list.scrollLeft = cur.offsetLeft - (list.clientWidth - cur.offsetWidth) / 2;
  }, [current]);

  return (
    <div className="sb">
      <div className="sb-top">
        <DeliverTo />
        <Link href="/account" className="sb-profile" aria-label="Your account">
          <UserIcon size={22} />
        </Link>
      </div>


      <nav aria-label="Categories">
        <ul ref={strip} className="sb-cats">
          {[{ slug: "all", name: "All" }, ...categories].map((c) => (
            <li key={c.slug}>
              <Link
                href={c.slug === "all" ? "/shop" : `/shop/${c.slug}`}
                className="sb-cat"
                aria-current={c.slug === current ? "page" : undefined}
              >
                <CategoryIcon slug={c.slug} size={26} />
                <span>{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

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

// Where to deliver: the phone's location, turned into an area name. It asks
// for the location once on its own (the first visit); after that the address
// is remembered, and a tap finds it again.
const ADDR_KEY = "bb-address";
const ASKED_KEY = "bb-address-asked";
type Addr = { area: string; line: string };

function DeliverTo() {
  const [addr, setAddr] = useState<Addr | null>(null);
  const [state, setState] = useState<"idle" | "finding" | "denied" | "failed">("idle");

  const locate = () => {
    if (!("geolocation" in navigator)) return setState("failed");
    setState("finding");
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {}
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`,
          );
          const d = await r.json();
          const area: string = d.locality || d.city || d.principalSubdivision || "";
          const line = [d.city && d.city !== area ? d.city : "", d.postcode].filter(Boolean).join(", ");
          if (!area) throw new Error("no area");
          const found = { area, line };
          setAddr(found);
          setState("idle");
          try {
            localStorage.setItem(ADDR_KEY, JSON.stringify(found));
          } catch {}
        } catch {
          setState("failed");
        }
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "failed"),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  };

  useEffect(() => {
    let saved: Addr | null = null;
    let asked = false;
    try {
      saved = JSON.parse(localStorage.getItem(ADDR_KEY) ?? "null");
      asked = localStorage.getItem(ASKED_KEY) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a remembered address once
    if (saved) setAddr(saved);
    else if (!asked) locate();
  }, []);

  const label =
    state === "finding"
      ? "Finding you…"
      : addr
        ? addr.area
        : state === "denied"
          ? "Location is off"
          : state === "failed"
            ? "Couldn't find you"
            : "Set your location";

  return (
    <button type="button" className="sb-where" onClick={locate} aria-label={`Delivering to ${label}. Tap to find your location again.`}>
      <span className="sb-where-kicker">Delivering to</span>
      <span className="sb-where-addr">
        <svg className="sb-pin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.3" />
        </svg>
        <b>{label}</b>
        {addr?.line && <span className="sb-where-line">{addr.line}</span>}
        <svg className="sb-caret" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 9h12l-6 7z" />
        </svg>
      </span>
    </button>
  );
}
