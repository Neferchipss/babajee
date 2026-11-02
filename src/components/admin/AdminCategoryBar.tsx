"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CategoryIcon from "@/components/CategoryIcon";

const EDGE = 4;

// The shop's category bar (icon over name, the current one underlined), for
// the admin: it switches the grid instead of opening a shelf, and each
// category carries how many products it has and how many still need work.
export default function AdminCategoryBar({
  categories,
  current,
  onPick,
}: {
  categories: { id: string; slug: string; name: string; count: number; todo: number }[];
  current: string;
  onPick: (id: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const prev = el.scrollLeft > EDGE;
    const next = el.scrollLeft < el.scrollWidth - el.clientWidth - EDGE;
    setEdges((s) => (s.prev === prev && s.next === next ? s : { prev, next }));
  }, []);

  // keep the current category in view, and the arrows in step with the strip
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const cur = list.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (cur && list.scrollWidth > list.clientWidth + EDGE) {
      const c = cur.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      if (c.left < l.left || c.right > l.right) list.scrollTo({ left: list.scrollLeft + c.left - l.left - (l.width - c.width) / 2, behavior: "instant" });
    }
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [current, measure, categories.length]);

  const nudge = (dir: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <nav className="acb" aria-label="Categories" data-prev={edges.prev} data-next={edges.next}>
      <button type="button" className="acb-btn acb-btn--prev" aria-hidden="true" tabIndex={-1} onClick={() => nudge(-1)}>
        <Chevron />
      </button>
      <ul ref={listRef} onScroll={measure}>
        {categories.map((c) => (
          <li key={c.id || "all"}>
            <button type="button" aria-pressed={current === c.id} onClick={() => onPick(c.id)} title={c.todo ? `${c.todo} still need a photo or price` : undefined}>
              <span className="acb-ico">
                <CategoryIcon slug={c.slug} />
                {c.todo > 0 && <i className="acb-dot" aria-hidden="true" />}
              </span>
              <span className="acb-lbl">
                {c.name} <small>{c.count}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="acb-btn acb-btn--next" aria-hidden="true" tabIndex={-1} onClick={() => nudge(1)}>
        <Chevron />
      </button>
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
