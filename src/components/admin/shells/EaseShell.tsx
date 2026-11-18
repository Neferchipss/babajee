"use client";

import Link from "next/link";
import { useState } from "react";
import ProfileMenu from "@/components/ProfileMenu";
import { AdminSearch } from "../AdminSearch";
import LowStockWatch from "../LowStockWatch";
import { useAdminNav, type Page } from "../nav-data";

// Ease: built for ease of use. Big section tabs across the top, the open
// section's pages as large buttons under them, one roomy column, large text.
// The home starts with today's jobs as big tiles, each with how many are
// waiting. On a phone the main sections sit in a tab bar at the bottom, like
// an app, with everything else under More.
const JOBS: { label: string; href: string; count?: Page["count"]; about: string }[] = [
  { label: "Payments to check", href: "/admin/orders?tab=pending", count: "unpaid", about: "Orders waiting to be marked paid" },
  { label: "Orders to pack", href: "/admin/orders?tab=paid", count: "to_pack", about: "Paid and ready to pack" },
  { label: "Ready to send", href: "/admin/orders?tab=packed", count: "to_ship", about: "Packed, waiting for the courier" },
  { label: "Customer requests", href: "/admin/orders?tab=requests", count: "requests", about: "Cancellations and returns to answer" },
  { label: "Running low", href: "/admin/inventory/stock?show=low", count: "low_stock", about: "Products to reorder" },
  { label: "Add a product", href: "/admin/products/new", about: "Put something new on the shop" },
];
const BOTTOM = ["/admin", "/admin/orders", "/admin/products", "/admin/customers"];

export default function EaseShell({ children }: { children: React.ReactNode }) {
  const { path, sections, here, sectionOn, pageOn, n, sectionCount, tap, money, setLow, role } = useAdminNav();
  const [moreAt, setMoreAt] = useState<string | null>(null);
  const more = moreAt === path;
  const counts = (key?: Page["count"]) => (key ? n({ label: "", href: "", count: key }) : 0);
  const bottom = sections.filter((s) => BOTTOM.includes(s.href));
  const rest = sections.filter((s) => !BOTTOM.includes(s.href));

  return (
    <div className="ez">
      <header className="ez-top">
        <Link href="/admin" className="ez-brand">
          <span className="ez-mark" aria-hidden="true">B</span>
          <span>
            Babajee <small>admin</small>
          </span>
        </Link>
        <div className="ez-search">
          <AdminSearch />
        </div>
        <ProfileMenu cart={false} />
      </header>

      <nav className="ez-tabs" aria-label="Sections">
        {sections.map((s) => {
          const on = sectionOn(s);
          const total = sectionCount(s);
          return (
            <Link key={s.href} href={s.href} className={on ? "is-on" : ""} aria-current={on ? "page" : undefined} onClick={tap(s.href)}>
              <span className="ez-tab-ico">{s.icon}</span>
              <span>{s.label}</span>
              {total > 0 && <b>{total}</b>}
            </Link>
          );
        })}
        <Link href="/admin/settings/design" className={path === "/admin/settings/design" ? "is-on" : ""}>
          <span className="ez-tab-ico">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M3.5 3.5h13v13h-13zM3.5 8h13M8 8v8.5" />
            </svg>
          </span>
          <span>Design</span>
        </Link>
      </nav>

      {here?.pages && here.pages.length > 1 && (
        <nav className="ez-sub" aria-label={`${here.label} pages`}>
          {here.pages.map((p) => {
            const c = n(p);
            return (
              <Link key={p.href} href={p.href} aria-current={pageOn(p.href) ? "page" : undefined} onClick={tap(p.href)}>
                {p.label}
                {c > 0 && <b className={p.warn ? "is-warn" : ""}>{c}</b>}
              </Link>
            );
          })}
        </nav>
      )}

      <main className="ez-main">
        {path === "/admin" && money && (
          <section className="ez-jobs" aria-label="Today's jobs">
            <h2>Today&apos;s jobs</h2>
            <div>
              {(role === "owner" || role === "admin" || role === "accounts" ? JOBS : []).map((j) => {
                const c = counts(j.count);
                return (
                  <Link key={j.href} href={j.href} className={`ez-job ${j.count && !c ? "is-clear" : ""}`}>
                    {j.count ? <b>{c}</b> : <b>+</b>}
                    <span>{j.label}</span>
                    <small>{j.count && !c ? "All done" : j.about}</small>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        {children}
      </main>

      <nav className="ez-bottom" aria-label="Main">
        {bottom.map((s) => (
          <Link key={s.href} href={s.href} className={sectionOn(s) ? "is-on" : ""} onClick={tap(s.href)}>
            {s.icon}
            <span>{s.label}</span>
          </Link>
        ))}
        <button type="button" className={more ? "is-on" : ""} aria-expanded={more} onClick={() => setMoreAt(more ? null : path)}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="M5 10h.01M10 10h.01M15 10h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span>More</span>
        </button>
      </nav>
      {more && (
        <div className="ez-more" role="dialog" aria-label="More sections">
          {rest.map((s) => (
            <Link key={s.href} href={s.href} onClick={() => setMoreAt(null)}>
              {s.icon}
              {s.label}
            </Link>
          ))}
          <Link href="/admin/settings/design" onClick={() => setMoreAt(null)}>
            Admin design
          </Link>
          <Link href="/shop">View the shop</Link>
        </div>
      )}
      {money && <LowStockWatch onCount={setLow} />}
    </div>
  );
}
