"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { homeCounts, type HomeCounts } from "@/lib/orders-db";
import LowStockWatch from "./LowStockWatch";
import { can, canOpen, useStaff } from "@/lib/staff";

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

const ALL_SECTIONS: Section[] = [
  { label: "Home", href: "/admin", icon: I("M3.5 9 10 3.5 16.5 9v7.5h-4.5v-5h-4v5H3.5z") },
  {
    label: "Orders",
    href: "/admin/orders",
    icon: I("M4 3.5h12l-1 13H5zM7.5 7a2.5 2.5 0 0 0 5 0"),
    pages: [
      { label: "All orders", href: "/admin/orders" },
      { label: "Payment pending", href: "/admin/orders?tab=pending", count: "unpaid" },
      { label: "To pack", href: "/admin/orders?tab=paid", count: "to_pack" },
      { label: "Ready to dispatch", href: "/admin/orders?tab=packed", count: "to_ship" },
      { label: "On the way", href: "/admin/orders?tab=shipped", count: "in_transit" },
      { label: "Customer requests", href: "/admin/orders?tab=requests", count: "requests", warn: true },
      { label: "Delivery problems", href: "/admin/orders?tab=problems" },
      { label: "Delivered", href: "/admin/orders?tab=delivered" },
      { label: "Cancelled & refunded", href: "/admin/orders?tab=closed" },
      { label: "Carts", href: "/admin/orders/carts" },
      { label: "New order", href: "/admin/orders/new" },
    ],
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: I("M10 2.8 16.5 6v8L10 17.2 3.5 14V6zM3.5 6 10 9.2 16.5 6M10 9.2v8"),
    pages: [
      { label: "All products", href: "/admin/products" },
      { label: "Add a product", href: "/admin/products/new" },
      { label: "Import from a sheet", href: "/admin/products/import" },
      { label: "Drafts", href: "/admin/products?need=hidden" },
      { label: "Archived", href: "/admin/products?need=archived" },
      { label: "Reorder needed", href: "/admin/products?need=low", count: "low_stock", warn: true },
      { label: "Out of stock", href: "/admin/products?need=out", count: "out_of_stock", warn: true },
      { label: "Purchases", href: "/admin/products/stock-in" },
      { label: "GST & HSN", href: "/admin/products/tax" },
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
      { label: "Messages", href: "/admin/support" },
      { label: "Sign-ins", href: "/admin/customers/sign-ins" },
    ],
  },
  {
    label: "Storefront",
    href: "/admin/storefront",
    icon: I("M3 8.5 4.5 4h11L17 8.5M3 8.5h14M3 8.5c0 1.4 1.1 2.5 2.4 2.5S7.8 9.9 7.8 8.5c0 1.4 1 2.5 2.2 2.5s2.2-1.1 2.2-2.5c0 1.4 1.1 2.5 2.4 2.5S17 9.9 17 8.5M4.5 11v5.5h11V11M8.5 16.5v-3.5h3v3.5"),
    pages: [
      { label: "Design and homepage", href: "/admin/storefront" },
      { label: "Banners", href: "/admin/storefront/banners" },
      { label: "Pages, blog and FAQs", href: "/admin/storefront/pages" },
      { label: "Menus", href: "/admin/storefront/menus" },
    ],
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: I("M3.5 16.5h13M6 13.5V9M10 13.5V5M14 13.5v-6"),
    pages: [
      { label: "Overview", href: "/admin/analytics" },
      { label: "Traffic", href: "/admin/analytics/traffic" },
      { label: "Live view", href: "/admin/analytics/live" },
      { label: "Reports", href: "/admin/analytics/reports" },
    ],
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: I("M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"),
    pages: [
      { label: "Store", href: "/admin/settings" },
      { label: "Team and roles", href: "/admin/settings/team" },
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
  const { me } = useStaff();
  const money = can(me?.role ?? null, "money");
  useEffect(() => {
    if (money) homeCounts().then(setCounts, () => {});
  }, [path, money]);
  // only what this person's role includes (0072)
  const SECTIONS = ALL_SECTIONS.map((s) => ({ ...s, pages: s.pages?.filter((p) => canOpen(me?.role ?? null, p.href.split("?")[0])) }))
    .filter((s) => canOpen(me?.role ?? null, s.href) || (s.pages?.length ?? 0) > 0)
    .map((s) => (canOpen(me?.role ?? null, s.href) || !s.pages?.length ? s : { ...s, href: s.pages[0].href }));

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
      {money && <LowStockWatch onCount={setLow} />}
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
