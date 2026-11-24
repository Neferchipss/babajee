"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { homeCounts, type HomeCounts } from "@/lib/orders-db";
import { can, canOpen, useStaff } from "@/lib/staff";

// The admin's sections and pages, with their live counts, filtered to what
// the signed-in person's role includes (0072). Every admin design (lib/
// admin-style.ts) draws its own menu from this. A link to the page already
// open with another filter (Orders › To pack while on Orders) tells that page
// to switch in place: the "adm-nav" event, which the orders and products
// pages listen for.
export type Page = { label: string; href: string; count?: keyof HomeCounts | "attention"; warn?: boolean };
type Section = { label: string; href: string; icon: ReactNode; pages?: Page[] };

export const I = (d: string) => (
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
      { label: "Counter sale (till)", href: "/admin/counter" },
    ],
  },
  {
    label: "Catalogue",
    href: "/admin/products",
    icon: I("M10 2.8 16.5 6v8L10 17.2 3.5 14V6zM3.5 6 10 9.2 16.5 6M10 9.2v8"),
    pages: [
      { label: "Products", href: "/admin/products" },
      { label: "Categories", href: "/admin/products/categories" },
      { label: "Add a product", href: "/admin/products/new" },
      { label: "Import from a sheet", href: "/admin/products/import" },
      { label: "Drafts", href: "/admin/products?need=hidden" },
      { label: "Archived", href: "/admin/products?need=archived" },
      { label: "Collections", href: "/admin/products/collections" },
      { label: "Reviews", href: "/admin/products/reviews" },
    ],
  },
  {
    label: "Inventory",
    href: "/admin/inventory/stock",
    icon: I("M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5l7 3.5 7-3.5M10 10v7M6.5 4.8l7 3.5"),
    pages: [
      { label: "Stock", href: "/admin/inventory/stock" },
      { label: "Purchase bills", href: "/admin/inventory/purchases" },
      { label: "Suppliers", href: "/admin/inventory/suppliers" },
      { label: "Stock history", href: "/admin/inventory/history" },
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
    label: "Finance",
    href: "/admin/finance/gst",
    icon: I("M4 3.5h12v13H4zM7 7h6M7 10h6M7 13h3"),
    pages: [
      { label: "GST & HSN", href: "/admin/finance/gst" },
      { label: "Invoices and credit notes", href: "/admin/finance/invoices" },
      { label: "GST returns and Tally", href: "/admin/finance/returns" },
      { label: "Profit and GST", href: "/admin/analytics#profit" },
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
      { label: "Admin design", href: "/admin/settings/design" },
      { label: "Activity log", href: "/admin/settings/activity" },
    ],
  },
];

const KEYS = ["tab", "need"];


export function useAdminNav() {
  const path = (usePathname() ?? "").replace(/\/$/, "") || "/";
  const params = useSearchParams();
  const [counts, setCounts] = useState<HomeCounts | null>(null);
  const [low, setLow] = useState(0);
  const { me } = useStaff();
  const role = me?.role ?? null;
  const money = can(role, "money");
  useEffect(() => {
    if (money) homeCounts().then(setCounts, () => {});
  }, [path, money]);
  const sections = ALL_SECTIONS.map((s) => ({ ...s, pages: s.pages?.filter((p) => canOpen(role, p.href.split("?")[0])) }))
    .filter((s) => canOpen(role, s.href) || (s.pages?.length ?? 0) > 0)
    .map((s) => (canOpen(role, s.href) || !s.pages?.length ? s : { ...s, href: s.pages[0].href }));

  // a page matches on its path, and on its filter when it names one
  const pageOn = (href: string) => {
    const [p, q] = href.split("?");
    if (p !== path) return false;
    const want = new URLSearchParams(q ?? "");
    return KEYS.every((k) => (want.get(k) ?? "") === (params.get(k) ?? "") || (!want.get(k) && params.get(k) === "all"));
  };
  // the section open now: the one with this exact page (filter included);
  // otherwise the one whose address this page sits under
  const loose = (s: Section) => (s.href === "/admin" ? path === "/admin" : path === s.href.split("?")[0] || path.startsWith(`${s.href.split("?")[0]}/`) || !!s.pages?.some((p) => p.href.split("?")[0] === path));
  const current = sections.find((s) => s.pages?.some((p) => pageOn(p.href))) ?? sections.find(loose);
  const sectionOn = (s: Section) => s.href === current?.href;
  const n = (p: Page) => (p.count && counts ? (counts[p.count as keyof HomeCounts] ?? 0) : 0);
  const sectionCount = (s: Section) => (s.href === "/admin/orders" && counts ? counts.unpaid + counts.to_pack + counts.to_ship : s.href === "/admin/inventory/stock" ? low : 0);
  // same page, another filter: let the page switch without reloading
  const tap = (href: string) => () => {
    const [p, q] = href.split("?");
    if (p !== path) return;
    const want = new URLSearchParams(q ?? "");
    window.dispatchEvent(new CustomEvent("adm-nav", { detail: Object.fromEntries(KEYS.map((k) => [k, want.get(k) ?? ""])) }));
  };
  const here = sections.find(sectionOn);
  // the page open now, by name (for breadcrumbs and titles)
  const page = here?.pages?.find((p) => pageOn(p.href)) ?? here?.pages?.find((p) => p.href.split("?")[0] === path);
  // the low-stock alert, for everyone who looks after stock
  const stockWatch = can(role, "catalog");
  return { path, params, sections, here, page, pageOn, sectionOn, n, sectionCount, tap, money, stockWatch, setLow, role };
}
