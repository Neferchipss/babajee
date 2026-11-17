"use client";

import Link from "next/link";
import { useState } from "react";
import ProfileMenu from "@/components/ProfileMenu";
import { AdminSearch } from "../AdminSearch";
import LowStockWatch from "../LowStockWatch";
import { I, useAdminNav } from "../nav-data";

// Shopify-style admin: a dark bar across the top (the shop's name, search,
// your account), a grey menu down the left where the section you're in opens
// to show its pages, and the page itself in white cards on a soft grey,
// centred. On a phone the menu slides in from the left.
export default function ShopifyShell({ children }: { children: React.ReactNode }) {
  const { path, sections, sectionOn, pageOn, n, sectionCount, tap, money, setLow } = useAdminNav();
  // open on this page only: moving to another page closes it
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);

  return (
    <div className="shp">
      <header className="shp-top">
        <button type="button" className="shp-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/admin" className="shp-brand">
          <span className="shp-mark" aria-hidden="true">B</span>
          <span>Babajee</span>
        </Link>
        <div className="shp-search">
          <AdminSearch />
        </div>
        <div className="shp-me">
          <ProfileMenu cart={false} />
        </div>
      </header>

      {open && <div className="shp-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav className={`shp-nav ${open ? "is-open" : ""}`} aria-label="Admin">
        <ul>
          {sections.map((s) => {
            const on = sectionOn(s);
            const total = sectionCount(s);
            return (
              <li key={s.href} className={on ? "is-on" : ""}>
                <Link href={s.href} className="shp-item" aria-current={on && (!s.pages || pageOn(s.href)) ? "page" : undefined} onClick={tap(s.href)}>
                  <span className="shp-ico">{s.icon}</span>
                  <span className="shp-lbl">{s.label}</span>
                  {total > 0 && <span className="shp-badge">{total}</span>}
                </Link>
                {on && s.pages && s.pages.length > 1 && (
                  <ul className="shp-sub">
                    {s.pages.slice(1).map((p) => {
                      const c = n(p);
                      return (
                        <li key={p.href}>
                          <Link href={p.href} aria-current={pageOn(p.href) ? "page" : undefined} onClick={tap(p.href)}>
                            <span>{p.label}</span>
                            {c > 0 && <span className={`shp-count ${p.warn ? "is-warn" : ""}`}>{c}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <div className="shp-nav-foot">
          <Link href="/shop" className="shp-item">
            <span className="shp-ico">{I("M7 4.5H4.5v11h11V13M10.5 3.5h6v6M16.5 3.5 9 11")}</span>
            <span className="shp-lbl">View your shop</span>
          </Link>
          <Link href="/admin/settings/design" className="shp-item">
            <span className="shp-ico">{I("M3.5 3.5h13v13h-13zM3.5 8h13M8 8v8.5")}</span>
            <span className="shp-lbl">Admin design</span>
          </Link>
        </div>
        {money && <LowStockWatch onCount={setLow} />}
      </nav>

      <main className="shp-main">
        <div className="shp-page">{children}</div>
      </main>
    </div>
  );
}
