"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { homeCounts, type HomeCounts } from "@/lib/orders-db";
import LowStockWatch from "./LowStockWatch";

// The admin's sections. On a wide screen a tree like the shop's category
// list: each section, and under it on a guide line every page it holds, with
// live counts; on a phone the sections as a strip, and under it the open
// section's pages as a row of chips with the same counts. A link to the page already open with another filter
// (Orders › To pack while on Orders) tells that page to switch in place:
// the "adm-nav" event, which the orders and products pages listen for.
type Page = { label: string; href: string; count?: keyof HomeCounts | "attention"; warn?: boolean };
type Section = { label: string; href: string; icon: ReactNode; pages?: Page[] };

const I = (d: string) => (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const SECTIONS: Section[] = [
  { label: "Home", href: "/admin", icon: I("M3.5 9 10 3.5 16.5 9v7.5h-4.5v-5h-4v5H3.5z") },
  {
    label: "Orders",
    href: "/admin/orders",
    icon: I("M4 3.5h12l-1 13H5zM7.5 7a2.5 2.5 0 0 0 5 0"),
    pages: [
      { label: "All orders", href: "/admin/orders" },
      { label: "Unpaid", href: "/admin/orders?tab=pending", count: "unpaid" },
      { label: "To pack", href: "/admin/orders?tab=paid", count: "to_pack" },
      { label: "To ship", href: "/admin/orders?tab=packed", count: "to_ship" },
      { label: "On the way", href: "/admin/orders?tab=shipped", count: "in_transit" },
      { label: "Customer requests", href: "/admin/orders?tab=requests", count: "requests", warn: true },
      { label: "Delivery problems", href: "/admin/orders?tab=problems" },
      { label: "Delivered", href: "/admin/orders?tab=delivered" },
      { label: "Cancelled & refunded", href: "/admin/orders?tab=closed" },
      { label: "Carts", href: "/admin/orders/carts" },
      { label: "Create an order", href: "/admin/orders/new" },
    ],
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: I("M10 2.8 16.5 6v8L10 17.2 3.5 14V6zM3.5 6 10 9.2 16.5 6M10 9.2v8"),
    pages: [
      { label: "All products", href: "/admin/products" },
      { label: "Add a product", href: "/admin/products/new" },
      { label: "Drafts", href: "/admin/products?need=hidden" },
      { label: "Archived", href: "/admin/products?need=archived" },
      { label: "Low stock", href: "/admin/products?need=low", count: "low_stock", warn: true },
      { label: "Out of stock", href: "/admin/products?need=out", count: "out_of_stock", warn: true },
      { label: "Collections", href: "/admin/products/collections" },
      { label: "Reviews", href: "/admin/products/reviews" },
    ],
  },
  {
    label: "Customers",
    href: "/admin/customers",
    icon: I("M7.5 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 16.5c.6-2.9 2.6-4.5 5-4.5s4.4 1.6 5 4.5M13 4a2.7 2.7 0 0 1 0 5.3M14.5 12.3c1.6.5 2.6 1.9 3 4.2"),
    pages: [
      { label: "All customers", href: "/admin/customers" },
      { label: "Sign-ins", href: "/admin/customers/sign-ins" },
    ],
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: I("M3.5 16.5h13M6 13.5V9M10 13.5V5M14 13.5v-6"),
    pages: [
      { label: "Overview", href: "/admin/analytics" },
      { label: "Traffic", href: "/admin/analytics/traffic" },
      { label: "Reports", href: "/admin/analytics/reports" },
    ],
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: I("M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"),
    pages: [
      { label: "Store", href: "/admin/settings" },
      { label: "Admins", href: "/admin/settings/team" },
      { label: "Activity log", href: "/admin/settings/activity" },
    ],
  },
];

const KEYS = ["tab", "need"];

export default function AdminNav() {
  const path = (usePathname() ?? "").replace(/\/$/, "") || "/";
  const params = useSearchParams();
  const [counts, setCounts] = useState<HomeCounts | null>(null);
  const [low, setLow] = useState(0);
  useEffect(() => {
    homeCounts().then(setCounts, () => {});
  }, [path]);

  // a page matches on its path, and on its filter when it names one
  const pageOn = (href: string) => {
    const [p, q] = href.split("?");
    if (p !== path) return false;
    const want = new URLSearchParams(q ?? "");
    return KEYS.every((k) => (want.get(k) ?? "") === (params.get(k) ?? "") || (!want.get(k) && params.get(k) === "all"));
  };
  const sectionOn = (s: Section) => (s.href === "/admin" ? path === "/admin" : path === s.href || path.startsWith(`${s.href}/`));
  const n = (p: Page) => (p.count && counts ? (counts[p.count as keyof HomeCounts] ?? 0) : 0);
  const sectionCount = (s: Section) => (s.href === "/admin/orders" && counts ? counts.unpaid + counts.to_pack + counts.to_ship : s.href === "/admin/products" ? low : 0);

  // same page, another filter: let the page switch without reloading
  const tap = (href: string) => () => {
    const [p, q] = href.split("?");
    if (p !== path) return;
    const want = new URLSearchParams(q ?? "");
    window.dispatchEvent(new CustomEvent("adm-nav", { detail: Object.fromEntries(KEYS.map((k) => [k, want.get(k) ?? ""])) }));
  };

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
              {total > 0 && <span className={`n ${s.href === "/admin/products" ? "is-low" : ""}`}>{total}</span>}
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
      <LowStockWatch onCount={setLow} />
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
