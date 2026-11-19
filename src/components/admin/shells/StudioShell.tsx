"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ProfileMenu from "@/components/ProfileMenu";
import { AdminSearch } from "../AdminSearch";
import LowStockWatch from "../LowStockWatch";
import { I, useAdminNav } from "../nav-data";

// Studio: for people who live in the admin all day. A slim dark icon rail
// for the sections, a panel with the open section's pages (folds away for
// more room), a breadcrumb bar on top, and a command search (Ctrl K / ⌘K)
// to jump to any page by typing, with the admin search for orders, products
// and customers beside it. Compact tables, more on screen.
const FOLD_KEY = "bj-studio-fold";

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const nav = useAdminNav();
  const { sections, here, page, sectionOn, pageOn, n, sectionCount, tap, setLow, stockWatch } = nav;
  // the shell only draws in the browser (after sign-in), so the saved fold can be read at once
  const [fold, setFold] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [cmd, setCmd] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const toggleFold = () => {
    setFold(!fold);
    try {
      localStorage.setItem(FOLD_KEY, fold ? "0" : "1");
    } catch {}
  };

  const showPanel = !!here?.pages && here.pages.length > 1 && !fold;

  return (
    <div className={`st ${showPanel ? "has-panel" : ""}`}>
      <aside className="st-rail" aria-label="Sections">
        <Link href="/admin" className="st-mark" aria-label="Admin home">
          B
        </Link>
        <nav>
          {sections.map((s) => {
            const on = sectionOn(s);
            const total = sectionCount(s);
            return (
              <Link key={s.href} href={s.href} className={on ? "is-on" : ""} aria-current={on ? "page" : undefined} title={s.label} onClick={tap(s.href)}>
                {s.icon}
                <span className="st-rail-lbl">{s.label}</span>
                {total > 0 && <i className="st-dot" aria-label={`${total} waiting`} />}
              </Link>
            );
          })}
        </nav>
        <div className="st-rail-foot">
          <Link href="/admin/settings/design" title="Admin design">
            {I("M3.5 3.5h13v13h-13zM3.5 8h13M8 8v8.5")}
            <span className="st-rail-lbl">Design</span>
          </Link>
          <Link href="/shop" title="View the shop">
            {I("M7 4.5H4.5v11h11V13M10.5 3.5h6v6M16.5 3.5 9 11")}
            <span className="st-rail-lbl">Shop</span>
          </Link>
        </div>
      </aside>

      {showPanel && here?.pages && (
        <aside className="st-panel" aria-label={`${here.label} pages`}>
          <div className="st-panel-head">
            <b>{here.label}</b>
            <button type="button" onClick={toggleFold} aria-label="Fold the panel away" title="Fold away">
              «
            </button>
          </div>
          <ul>
            {here.pages.map((p) => {
              const c = n(p);
              return (
                <li key={p.href}>
                  <Link href={p.href} aria-current={pageOn(p.href) ? "page" : undefined} onClick={tap(p.href)}>
                    <span>{p.label}</span>
                    {c > 0 && <b className={p.warn ? "is-warn" : ""}>{c}</b>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      <div className="st-body">
        <header className="st-bar">
          {fold && here?.pages && here.pages.length > 1 && (
            <button type="button" className="st-unfold" onClick={toggleFold} aria-label="Show the pages panel" title="Show pages">
              »
            </button>
          )}
          <nav className="st-crumbs" aria-label="You are here">
            <Link href="/admin">Admin</Link>
            {here && here.href !== "/admin" && (
              <>
                <span aria-hidden="true">/</span>
                <Link href={here.href}>{here.label}</Link>
              </>
            )}
            {page && page.href.split("?")[0] !== here?.href.split("?")[0] && (
              <>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{page.label}</span>
              </>
            )}
          </nav>
          <button type="button" className="st-cmd-btn" onClick={() => setCmd(true)}>
            <span>Jump to…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="st-search">
            <AdminSearch />
          </div>
          <ProfileMenu cart={false} />
        </header>
        <main className="st-main">{children}</main>
      </div>

      {cmd && <Command onClose={() => setCmd(false)} nav={nav} />}
      {stockWatch && <LowStockWatch onCount={setLow} />}
    </div>
  );
}

// the command search: every page this person can open, found by typing
function Command({ onClose, nav }: { onClose: () => void; nav: ReturnType<typeof useAdminNav> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(
    () =>
      nav.sections.flatMap((s) => [
        { label: s.label, where: "", href: s.href, count: nav.sectionCount(s) },
        ...(s.pages ?? []).filter((p) => p.href !== s.href).map((p) => ({ label: p.label, where: s.label, href: p.href, count: nav.n(p) })),
      ]),
    [nav],
  );
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = all.filter((x) => words.every((w) => `${x.label} ${x.where}`.toLowerCase().includes(w))).slice(0, 12);
  useEffect(() => input.current?.focus(), []);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="st-cmd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="st-cmd" role="dialog" aria-modal="true" aria-label="Jump to a page">
        <input
          ref={input}
          value={q}
          placeholder="Type a page: to pack, carts, GST, banners…"
          aria-label="Page to jump to"
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setAt((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAt((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && hits[at]) go(hits[at].href);
          }}
        />
        <ul role="listbox">
          {hits.map((x, i) => (
            <li key={x.href} role="option" aria-selected={i === at}>
              <button type="button" onMouseEnter={() => setAt(i)} onClick={() => go(x.href)}>
                <span>{x.label}</span>
                {x.where && <small>{x.where}</small>}
                {x.count > 0 && <b>{x.count}</b>}
              </button>
            </li>
          ))}
          {!hits.length && <li className="st-cmd-none">No page called that. For orders, products or customers, use the search in the bar.</li>}
        </ul>
        <p className="st-cmd-foot">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
