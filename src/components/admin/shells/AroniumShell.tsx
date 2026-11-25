"use client";

import Link from "next/link";
import { useState } from "react";
import ProfileMenu from "@/components/ProfileMenu";
import { canOpen } from "@/lib/staff";
import LowStockWatch from "../LowStockWatch";
import { I, useAdminNav, type Page } from "../nav-data";
import { ARONIUM_MENU, locate, SHOP_MENU, type ArEntry } from "./aronium-menu";

// Aronium-style: the back office of the Aronium till, copied for the admin.
// Charcoal and square: a title bar reading "Management • <screen>" with a back
// arrow and a close cross (and your account, to sign out), Aronium's own menu
// down the left (aronium-menu.tsx: its thirteen screens in its order, the open
// one in solid blue; compact, icons only, until opened out with » at its foot, as Aronium's), the online shop's extras under
// it, and the open screen's pages as tabs above the page. On a phone the menu
// slides in from the left.
const FOLD_KEY = "bj-aronium-fold";

const Glyph = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" fillRule="evenodd" aria-hidden="true">
    <path d={d} />
  </svg>
);

export default function AroniumShell({ children }: { children: React.ReactNode }) {
  const { path, params, n, sectionCount, sections, tap, setLow, stockWatch, role } = useAdminNav();
  // the shell only draws in the browser (after sign-in), so the saved fold can be read at once
  const [fold, setFold] = useState(() => {
    try {
      // compact (icons only) unless this person has opened it out
      return typeof window === "undefined" || localStorage.getItem(FOLD_KEY) !== "0";
    } catch {
      return true;
    }
  });
  // the phone menu: open on this page only, so moving to another page closes it
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const toggleFold = () => {
    setFold(!fold);
    try {
      localStorage.setItem(FOLD_KEY, fold ? "0" : "1");
    } catch {}
  };

  const { entry, tab } = locate(path, new URLSearchParams(params.toString()));
  const allowed = (e: ArEntry) => canOpen(role, e.href) || !!e.tabs?.some((t) => canOpen(role, t.href));
  const hrefOf = (e: ArEntry) => (canOpen(role, e.href) ? e.href : (e.tabs?.find((t) => canOpen(role, t.href))?.href ?? e.href));
  const tabs = entry.tabs?.filter((t) => canOpen(role, t.href));
  // the badges the ordinary menu shows, on the matching Aronium entries
  const badge = (e: ArEntry) => {
    const s = sections.find((x) => x.href === e.href);
    return s ? sectionCount(s) : 0;
  };

  const item = (e: ArEntry) => {
    const on = e === entry;
    const total = badge(e);
    const href = hrefOf(e);
    return (
      <li key={e.href}>
        <Link href={href} className={on ? "is-on" : ""} aria-current={on ? "page" : undefined} title={fold ? e.label : undefined} onClick={tap(href)}>
          <span className="ar-ico">
            <Glyph d={e.icon} />
          </span>
          <span className="ar-lbl">{e.label}</span>
          {total > 0 && <span className="ar-badge">{total}</span>}
        </Link>
      </li>
    );
  };
  const shop = SHOP_MENU.filter(allowed);

  return (
    <div className={`ar ${fold ? "is-folded" : ""}`}>
      <header className="ar-bar">
        <button type="button" className="ar-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpenAt(open ? null : path)}>
          {I("M3 5.5h14M3 10h14M3 14.5h14")}
        </button>
        <Link href="/admin" className="ar-back" aria-label="Dashboard">
          {I("M16.5 10h-13M8.5 5 3.5 10l5 5")}
        </Link>
        <h1 className="ar-title">
          <span className="ar-title-root">Management</span>
          <span aria-hidden="true"> • </span>
          <span>{entry.label}</span>
        </h1>
        <Link href={`/admin/help?from=${encodeURIComponent(path)}`} className="ar-help" aria-label="Documentation: how to use this admin" title="Documentation">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M7.8 7.8a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.6M10 14.4h.01" />
          </svg>
        </Link>
        <div className="ar-me">
          <ProfileMenu cart={false} />
        </div>
        <Link href="/shop" className="ar-close" aria-label="Close the admin and view the shop" title="View the shop">
          {I("M4.5 4.5l11 11M15.5 4.5l-11 11")}
        </Link>
      </header>

      {open && <div className="ar-scrim" onClick={() => setOpenAt(null)} aria-hidden="true" />}
      <nav className={`ar-nav ${open ? "is-open" : ""}`} aria-label="Management">
        <ul>{ARONIUM_MENU.filter(allowed).map(item)}</ul>
        {shop.length > 0 && (
          <>
            <p className="ar-group">Online shop</p>
            <ul>{shop.map(item)}</ul>
          </>
        )}
        <button type="button" className="ar-fold" onClick={toggleFold} aria-expanded={!fold} aria-label={fold ? "Open the menu out to show names" : "Make the menu compact: icons only"} title={fold ? "Expand menu" : "Compact menu"}>
          {fold ? "»" : "«"}
        </button>
        {stockWatch && <LowStockWatch onCount={setLow} />}
      </nav>

      <main className="ar-main">
        {tabs && tabs.length > 1 && (
          <div className="ar-tabs" role="tablist" aria-label={`${entry.label} pages`}>
            {tabs.map((t) => {
              const on = t === tab;
              const c = n(t as Page);
              return (
                <Link key={t.href} href={t.href} role="tab" aria-selected={on} className={on ? "is-on" : ""} onClick={tap(t.href)}>
                  {t.label}
                  {c > 0 && <b className={t.warn ? "is-warn" : ""}>{c}</b>}
                </Link>
              );
            })}
          </div>
        )}
        <div className="ar-page">{children}</div>
      </main>
    </div>
  );
}
