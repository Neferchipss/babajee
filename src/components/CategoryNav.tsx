"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import CategoryIcon from "./CategoryIcon";

type Props = {
  categories: { slug: string; name: string }[];
  currentSlug: string;
};

const EDGE = 4;

// The category list. Themes lay it out as a sidebar or as a horizontal strip;
// when it is a strip this adds edge fades and prev/next buttons so the hidden
// categories are visible, and it keeps the current one in view.
export default function CategoryNav({ categories, currentSlug }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

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
        <ul ref={listRef} onScroll={measure}>
          <li>
            <Link href="/shop">
              <span className="cp-ico">
                <CategoryIcon slug="all" />
              </span>
              <span className="cp-lbl">All categories</span>
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/shop/${c.slug}`} aria-current={c.slug === currentSlug ? "page" : undefined}>
                <span className="cp-ico">
                  <CategoryIcon slug={c.slug} />
                </span>
                <span className="cp-lbl">{c.name}</span>
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
