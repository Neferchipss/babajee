import type { HomeCounts } from "@/lib/orders-db";

// The Aronium-style design's menu: Aronium's own Management menu, entry for
// entry and in its order, each opening Babajee's page that does that job
// (or a screen made for this design where Babajee had none). Under it, the
// online shop's extras that Aronium, a counter till, doesn't have. An entry's
// tabs are the pages that belong with it, shown across the top as Aronium
// shows "Users | Security".
export type ArTab = { label: string; href: string; count?: keyof HomeCounts; warn?: boolean };
export type ArEntry = { label: string; href: string; icon: string; tabs?: ArTab[]; also?: string[] };

// Aronium's glyphs, drawn solid in a 20 × 20 box
const G = {
  till: "M3 9h14v8.5H3zM5 10.5v2h10v-2zM5 14v1.8h2V14zm3.5 0v1.8h2V14zm3.5 0v1.8h3V14zM5.5 3h7v5h-7zM7 4.5v2h4v-2z",
  dashboard: "M2.5 2.5h15v15h-15zM4.3 4.3v11.4h4.6V4.3zM10.7 4.3v4.8h5V4.3zM10.7 10.9v4.8h5v-4.8z",
  documents: "M4 2.5h12v15H4zM6.3 5v1.8h7.4V5zM6.3 8.6v1.8h7.4V8.6zM6.3 12.2v1.8h7.4v-1.8z",
  products: "M2.5 2.5h7.2l7.8 7.8-7.2 7.2-7.8-7.8zM6.3 4.8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  pricelists: "M2 4h16v12H2zM3.8 5.8v8.4h12.4V5.8zM10 6.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM9.4 8.2v3.6h1.2V8.2z",
  stock: "M2 3h16v4.2H2zM3 8.5h14V17H3zM7.5 10.3v1.7h5v-1.7z",
  reporting: "M2.5 2.5h15v15h-15zM5 10v5h2.2v-5zM9 6v9h2.2V6zM13 8.5V15h2.2V8.5z",
  customers: "M7 9.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM1.5 17c0-3.4 2.4-6 5.5-6s5.5 2.6 5.5 6zM14 9a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 14 9zM13.8 17c0-2.2-.7-4.2-1.9-5.4.6-.3 1.3-.5 2.1-.5 2.6 0 4.5 2.2 4.5 5.9z",
  promotions: "M10 17.5 3.3 10.9A4.3 4.3 0 0 1 10 5.3a4.3 4.3 0 0 1 6.7 5.6z",
  users: "M13.6 2a4.4 4.4 0 0 0-4.2 5.8L2.5 14.7v2.8h2.8l6.9-6.9A4.4 4.4 0 1 0 13.6 2zm.9 2.3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
  payments: "M1.5 4h17v12h-17zM3.2 7.2v1.8h13.6V7.2zM3.2 12v1.5h5V12z",
  countries: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4.2 9.2h2.7c.1-1.6.5-3.1 1.1-4.3a6.2 6.2 0 0 0-3.8 4.3zm0 1.6a6.2 6.2 0 0 0 3.8 4.3c-.6-1.2-1-2.7-1.1-4.3zm4.4 0c.2 2.3 1 4.1 1.4 4.6.4-.5 1.2-2.3 1.4-4.6zm0-1.6h2.8C11.2 6.9 10.4 5.1 10 4.6c-.4.5-1.2 2.3-1.4 4.6zm4.5 0h2.7A6.2 6.2 0 0 0 12 4.9c.6 1.2 1 2.7 1.1 4.3zm0 1.6c-.1 1.6-.5 3.1-1.1 4.3a6.2 6.2 0 0 0 3.8-4.3z",
  tax: "M15.2 3.4l1.4 1.4L4.8 16.6l-1.4-1.4zM5.7 8.4a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4zM14.3 17a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z",
  company: "M2.5 3h9v14h-9zM12.5 7.5h5V17h-5zM4.3 5v1.6H6V5zm3.2 0v1.6h1.7V5zM4.3 8.4V10H6V8.4zm3.2 0V10h1.7V8.4zM4.3 11.8v1.6H6v-1.6zm3.2 0v1.6h1.7v-1.6zM14 9.4V11h1.6V9.4zm0 3.2v1.6h1.6v-1.6z",
  storefront: "M2.5 3h15l1 5.2c0 1.3-1.1 2.3-2.4 2.3s-2.4-1-2.4-2.3c0 1.3-1.1 2.3-2.5 2.3S8.7 9.5 8.7 8.2c0 1.3-1.1 2.3-2.4 2.3S3.9 9.5 3.9 8.2zM3.5 11.6c.8.4 1.8.5 2.7.3v4.6h3v-3.8h3.4v3.8h3.1v-4.6c.9.2 1.8.1 2.8-.3v6.2H3.5z",
  analytics: "M2.5 2.5h2v13h13v2h-15zM5.5 12.6l3.6-4.2 2.8 2.5 4.4-5.4 1.4 1.1-5.6 6.9-2.8-2.5-2.4 2.8z",
  messages: "M2 3.5h16v10.5H7.5L3.5 17.5V14H2z",
  docs: "M4 2.5h8.5L16 6v11.5H4zM12 3.6V6.5h2.9zM6.3 9v1.5h7.4V9zM6.3 12v1.5h7.4V12zM6.3 15v1.5h4.6V15z",
  theme: "M10 2a8 8 0 0 0 0 16c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.8-.5-1.2-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6h1.9A3.6 3.6 0 0 0 18 8.8C18 5 14.4 2 10 2zM5.6 10.4a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm2.2-3.6a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm2.4 3.6a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z",
};
export const GLYPH = G;

export const ARONIUM_MENU: ArEntry[] = [
  { label: "Dashboard", href: "/admin", icon: G.dashboard },
  // Aronium's sales screen, as Babajee's counter till (0085)
  { label: "Till", href: "/admin/counter", icon: G.till },
  {
    label: "Documents",
    href: "/admin/orders",
    icon: G.documents,
    tabs: [
      { label: "View documents", href: "/admin/orders" },
      { label: "Payment pending", href: "/admin/orders?tab=pending", count: "unpaid" },
      { label: "To pack", href: "/admin/orders?tab=paid", count: "to_pack" },
      { label: "Ready to dispatch", href: "/admin/orders?tab=packed", count: "to_ship" },
      { label: "Customer requests", href: "/admin/orders?tab=requests", count: "requests", warn: true },
      { label: "Purchases", href: "/admin/inventory/purchases" },
      { label: "Invoices", href: "/admin/finance/invoices" },
      { label: "New sale", href: "/admin/orders/new" },
      { label: "Carts", href: "/admin/orders/carts" },
    ],
    also: ["/admin/orders/view", "/admin/orders/print", "/admin/inventory/purchases/bill"],
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: G.products,
    tabs: [
      { label: "Products", href: "/admin/products" },
      { label: "Drafts", href: "/admin/products?need=hidden" },
      { label: "Archived", href: "/admin/products?need=archived" },
      { label: "Product groups", href: "/admin/products/categories" },
      { label: "Collections", href: "/admin/products/collections" },
      { label: "Reviews", href: "/admin/products/reviews" },
      { label: "Import", href: "/admin/products/import" },
    ],
    also: ["/admin/products/edit", "/admin/products/new"],
  },
  { label: "Price lists", href: "/admin/price-lists", icon: G.pricelists },
  {
    label: "Stock",
    href: "/admin/inventory/stock",
    icon: G.stock,
    tabs: [
      { label: "Stock", href: "/admin/inventory/stock" },
      { label: "Stock history", href: "/admin/inventory/history" },
    ],
  },
  { label: "Reporting", href: "/admin/analytics/reports", icon: G.reporting },
  {
    label: "Customers & suppliers",
    href: "/admin/customers",
    icon: G.customers,
    tabs: [
      { label: "Customers", href: "/admin/customers" },
      { label: "Suppliers", href: "/admin/inventory/suppliers" },
      { label: "Sign-ins", href: "/admin/customers/sign-ins" },
    ],
    also: ["/admin/customers/view"],
  },
  { label: "Promotions", href: "/admin/promotions", icon: G.promotions },
  {
    label: "Users & security",
    href: "/admin/settings/team",
    icon: G.users,
    tabs: [
      { label: "Users", href: "/admin/settings/team" },
      { label: "Security", href: "/admin/settings/team?tab=security" },
      { label: "Activity log", href: "/admin/settings/activity" },
    ],
  },
  { label: "Payment types", href: "/admin/payment-types", icon: G.payments },
  { label: "Countries", href: "/admin/countries", icon: G.countries },
  {
    label: "Tax rates",
    href: "/admin/tax-rates",
    icon: G.tax,
    tabs: [
      { label: "Tax rates", href: "/admin/tax-rates" },
      { label: "Product taxes (HSN)", href: "/admin/finance/gst" },
      { label: "Tax returns", href: "/admin/finance/returns" },
    ],
  },
  // My company draws Aronium's own tabs inside the screen (Company data, Void
  // reasons, My logo, Reset database) with the shop's settings added after
  // them, so the menu adds none of its own
  { label: "My company", href: "/admin/settings", icon: G.company },
];

// what the online shop adds to Aronium
export const SHOP_MENU: ArEntry[] = [
  {
    label: "Storefront",
    href: "/admin/storefront",
    icon: G.storefront,
    tabs: [
      { label: "Colours and homepage", href: "/admin/storefront" },
      { label: "Banners", href: "/admin/storefront/banners" },
      { label: "Pages, blog and FAQs", href: "/admin/storefront/pages" },
      { label: "Menus", href: "/admin/storefront/menus" },
    ],
  },
  // the admin's own look, picked per person
  { label: "Admin theme", href: "/admin/settings/design", icon: G.theme },
  {
    label: "Web analytics",
    href: "/admin/analytics",
    icon: G.analytics,
    tabs: [
      { label: "Overview", href: "/admin/analytics" },
      { label: "Traffic", href: "/admin/analytics/traffic" },
      { label: "Live view", href: "/admin/analytics/live" },
    ],
  },
  { label: "Messages", href: "/admin/support", icon: G.messages },
  // the guide to every screen (also the ? in the title bar)
  { label: "Documentation", href: "/admin/help", icon: G.docs },
];

// the entry and tab for an address: the tab whose path (and filter, when it
// names one) matches, else the entry whose pages this address sits under
export function locate(path: string, search: URLSearchParams) {
  const all = [...ARONIUM_MENU, ...SHOP_MENU];
  const bare = (h: string) => h.split("?")[0];
  const tabOn = (t: ArTab) => {
    if (bare(t.href) !== path) return false;
    const want = new URLSearchParams(t.href.split("?")[1] ?? "");
    for (const k of ["tab", "view", "need"]) if ((want.get(k) ?? "") !== (search.get(k) ?? "") && !(!want.get(k) && search.get(k) === "all")) return false;
    return true;
  };
  for (const e of all) {
    const t = e.tabs?.find(tabOn);
    if (t) return { entry: e, tab: t };
  }
  for (const e of all) if (bare(e.href) === path) return { entry: e, tab: null };
  // a page under an entry: its own tab when it has one, else the entry's longest match
  let best: { entry: ArEntry; tab: ArTab | null; n: number } | null = null;
  for (const e of all) {
    for (const p of [e.href, ...(e.tabs ?? []).map((t) => t.href), ...(e.also ?? [])].map(bare)) {
      if (p !== "/admin" && (path === p || path.startsWith(`${p}/`)) && p.length > (best?.n ?? 0)) best = { entry: e, tab: e.tabs?.find((t) => bare(t.href) === p) ?? null, n: p.length };
    }
  }
  return best ? { entry: best.entry, tab: best.tab } : { entry: ARONIUM_MENU[0], tab: null };
}
