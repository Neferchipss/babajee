"use client";

import Link from "next/link";
import SceneLink from "@/components/SceneLink";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import CategoryIcon from "./CategoryIcon";
import { shelfLeaving } from "@/lib/shelf-switch";

type Props = {
  categories: { slug: string; name: string; count?: number }[];
  currentSlug: string;
};

const EDGE = 4;

// Where the "you are here" highlight last was, kept across pages: the list is
// built afresh on each category's page, and the highlight glides from here.
let lastInk: { top: number; left: number; width: number; height: number } | null = null;

// The category list. Themes lay it out as a sidebar or as a horizontal strip;
// when it is a strip this adds edge fades and prev/next buttons so the hidden
// categories are visible, and it keeps the current one in view.
export default function CategoryNav({ categories, currentSlug }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  // the highlight behind the current category (shown where the theme lays
  // the list out as a column): placed where it last was, then moved to the
  // current one, so it glides; a click moves it at once, before the page
  const inkTo = useCallback((link: HTMLElement | null, glide: boolean) => {
    const ink = inkRef.current;
    const strip = ink?.parentElement;
    if (!ink || !strip || !link) return;
    const s = strip.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    if (!l.height) return;
    const to = { top: l.top - s.top, left: l.left - s.left, width: l.width, height: l.height };
    if (!glide && lastInk) {
      ink.style.transition = "none";
      ink.style.transform = `translate(${lastInk.left}px, ${lastInk.top}px)`;
      ink.style.width = `${lastInk.width}px`;
      ink.style.height = `${lastInk.height}px`;
      void ink.offsetHeight; // lay it out there before moving on
      ink.style.transition = "";
    }
    ink.style.transform = `translate(${to.left}px, ${to.top}px)`;
    ink.style.width = `${to.width}px`;
    ink.style.height = `${to.height}px`;
    ink.dataset.on = "true";
    lastInk = to;
  }, []);
  useLayoutEffect(() => {
    inkTo(listRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null, false);
  }, [currentSlug, inkTo]);
  const tap = (e: React.MouseEvent<HTMLElement>) => {
    inkTo(e.currentTarget, true);
    // another category's shelf: dim this one until it arrives
    const href = e.currentTarget.getAttribute("href") ?? "";
    if (href.startsWith("/shop/") && e.currentTarget.getAttribute("aria-current") !== "page") shelfLeaving();
  };

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const prev = el.scrollLeft > EDGE;
    const next = el.scrollLeft < el.scrollWidth - el.clientWidth - EDGE;
    setEdges((s) => (s.prev === prev && s.next === next ? s : { prev, next }));
  }, []);

  // Bring the current category into view: sideways in a strip, or inside the
  // sticky sidebar when that one scrolls.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const cur = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (cur) {
      const c = cur.getBoundingClientRect();
      if (list.scrollWidth > list.clientWidth + EDGE) {
        const l = list.getBoundingClientRect();
        list.scrollTo({ left: list.scrollLeft + c.left - l.left - (l.width - c.width) / 2, behavior: "instant" });
      } else {
        const side = list.closest<HTMLElement>(".cp-side");
        if (side && side.scrollHeight > side.clientHeight + EDGE) {
          const s = side.getBoundingClientRect();
          side.scrollTo({ top: side.scrollTop + c.top - s.top - (s.height - c.height) / 2, behavior: "instant" });
        }
      }
    }
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [currentSlug, measure]);

  const nudge = (dir: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <nav aria-label="Categories" className="cp-cats">
      <h2>Categories</h2>
      <div className="cp-strip" data-prev={edges.prev} data-next={edges.next}>
        <button type="button" className="cp-strip-btn cp-strip-btn--prev" aria-hidden="true" tabIndex={-1} onClick={() => nudge(-1)}>
          <Chevron />
        </button>
        <span ref={inkRef} className="cp-ink" aria-hidden="true" />
        <ul ref={listRef} onScroll={measure}>
          <li>
            <SceneLink href="/shop" aria-current={currentSlug === "all" ? "page" : undefined} onClick={tap}>
              <span className="cp-ico">
                <CategoryIcon slug="all" />
              </span>
              <span className="cp-lbl">All categories</span>
            </SceneLink>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/shop/${c.slug}`} aria-current={c.slug === currentSlug ? "page" : undefined} onClick={tap}>
                <span className="cp-ico">
                  <CategoryIcon slug={c.slug} />
                </span>
                <span className="cp-lbl">{c.name}</span>
                {c.count !== undefined && <span className="cp-num">{c.count}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" className="cp-strip-btn cp-strip-btn--next" aria-hidden="true" tabIndex={-1} onClick={() => nudge(1)}>
          <Chevron />
        </button>
      </div>
    </nav>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
