"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CategoryIcon from "./CategoryIcon";
import "./category-switch.css";

type Category = { slug: string; name: string; count?: number };

// The current category as a button: tap it and every category drops down
// under it, to switch to. On the shelf it is the title in the sticky bar
// (each category a link); in the product sheet it is a wider pill over the
// card, and picking a category hands it to onPick.
export default function CategorySwitch({
  current,
  categories,
  onPick,
  variant = "bar",
}: {
  current: Category;
  categories: Category[];
  onPick?: (slug: string) => void;
  variant?: "bar" | "sheet";
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);

  // the menu is fixed to the screen (so no bar or card around it clips it):
  // under the whole bar on the shelf, under the pill in the sheet
  const toggle = () => {
    const el = root.current;
    if (!open && el) {
      const under = (variant === "bar" ? el.closest(".cp-hero") ?? el : el).getBoundingClientRect();
      const top = under.bottom + (variant === "bar" ? 0 : 8);
      setPlace(
        variant === "bar"
          ? { top, left: 0, right: 0, maxHeight: `calc(100dvh - ${top + 16}px)` }
          : { top, left: under.left, width: under.width, maxHeight: `calc(100dvh - ${top + 24}px)` },
      );
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // the sheet behind closes on Escape too
      setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key, true);
    // the current one in view, if the list scrolls
    root.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <div ref={root} className="csw" data-variant={variant} data-open={open}>
      <button
        type="button"
        className="csw-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
      >
        {variant === "sheet" && (
          <span className="csw-ico">
            <CategoryIcon slug={current.slug} size={18} />
          </span>
        )}
        <span className="csw-name">{current.name}</span>
        <svg className="csw-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="csw-menu" aria-label="Categories" style={place}>
          {categories.map((c) => {
            const here = c.slug === current.slug;
            const inner = (
              <>
                <span className="csw-ico">
                  <CategoryIcon slug={c.slug} size={18} />
                </span>
                <span className="csw-label">{c.name}</span>
                {c.count !== undefined && <span className="csw-num">{c.count}</span>}
              </>
            );
            return (
              <li key={c.slug}>
                {onPick ? (
                  <button
                    type="button"
                    className="csw-item"
                    aria-current={here ? "page" : undefined}
                    onClick={() => {
                      setOpen(false);
                      onPick(c.slug);
                    }}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    href={`/shop/${c.slug}`}
                    className="csw-item"
                    aria-current={here ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
