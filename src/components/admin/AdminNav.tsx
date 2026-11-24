"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import LowStockWatch from "./LowStockWatch";
import { I, useAdminNav } from "./nav-data";

// The current admin design's menu. On a wide screen a tree like the shop's
// category list: each section, and under it on a guide line every page it
// holds, with live counts; on a phone the sections as a strip, and under it
// the open section's pages as a row of chips with the same counts.
export default function AdminNav() {
  const { path, params, sections: SECTIONS, pageOn, sectionOn, n, sectionCount, tap, setLow, stockWatch } = useAdminNav();
  // phone: the open section's pages, the current one scrolled into view
  const here = SECTIONS.find(sectionOn);
  const sub = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = sub.current;
    const on = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && on) row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2 });
  }, [path, params]);

  return (
    <>
    <nav className="adm-nav" aria-label="Admin sections">
      {SECTIONS.map((s) => {
        const on = sectionOn(s);
        const total = sectionCount(s);
        return (
          <div key={s.href} className={`adm-sec ${on ? "is-on" : ""}`}>
            <Link href={s.href} className="adm-sec-link" aria-current={on && (!s.pages || pageOn(s.href)) ? "page" : undefined} onClick={tap(s.href)}>
              <span className="adm-ico">{s.icon}</span>
              {s.label}
              {total > 0 && <span className={`n ${s.href === "/admin/inventory/stock" ? "is-low" : ""}`}>{total}</span>}
            </Link>
            {s.pages && (
              <ul className="adm-tree">
                {s.pages.map((p) => {
                  const c = n(p);
                  return (
                    <li key={p.href}>
                      <Link href={p.href} aria-current={pageOn(p.href) ? "page" : undefined} onClick={tap(p.href)}>
                        <span className="adm-tree-lbl">{p.label}</span>
                        {c > 0 && <span className={`adm-tree-n ${p.warn ? "is-warn" : ""}`}>{c}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      <span className="gap" />
      <Link href="/shop" className="adm-sec-link adm-shop">
        <span className="adm-ico">{I("M7 4.5H4.5v11h11V13M10.5 3.5h6v6M16.5 3.5 9 11")}</span>
        View shop
      </Link>
      <Link href="/admin/settings/design" className="adm-sec-link adm-shop">
        <span className="adm-ico">{I("M3.5 3.5h13v13h-13zM3.5 8h13M8 8v8.5")}</span>
        Admin design
      </Link>
      <Link
        href={path.startsWith("/admin/help") ? "/admin/help" : `/admin/help?from=${encodeURIComponent(path)}`}
        className="adm-sec-link adm-shop"
        aria-current={path.startsWith("/admin/help") ? "page" : undefined}
      >
        <span className="adm-ico">{I("M5 2.5h7l3.5 3.5v11.5H5zM12 2.5V6h3.5M7.5 9.5h5M7.5 12.5h5M7.5 15.5h3")}</span>
        Documentation
      </Link>
      {stockWatch && <LowStockWatch onCount={setLow} />}
          </nav>
    {here?.pages && (
      <div className="adm-subnav" ref={sub} aria-label={`${here.label} pages`}>
        {here.pages.map((p) => {
          const c = n(p);
          return (
            <Link key={p.href} href={p.href} aria-current={pageOn(p.href) ? "page" : undefined} onClick={tap(p.href)}>
              {p.label}
              {c > 0 && <b className={p.warn ? "is-warn" : ""}>{c}</b>}
            </Link>
          );
        })}
      </div>
    )}
    </>
  );
}
