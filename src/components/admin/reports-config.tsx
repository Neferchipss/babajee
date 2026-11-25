import { money } from "@/components/admin/ui";
import { dayLabel } from "@/lib/dates";
import type { ReportKind, ReportRow } from "@/lib/orders-db";

// The admin's reports, as data: each report's name, what it's for, and its
// columns (label, format, totals). Shared by Analytics > Reports and the
// Aronium-style design's Reporting screen.
// csv: the column's header in the download when it differs from the screen
// label (downloads keep their original headers so saved analyses still work)
export type Fmt = "text" | "money" | "count" | "num" | "pct" | "day" | "month";
// csv: the column's header in the download when it differs from the screen
// label (downloads keep their original headers so saved analyses still work)
export type Col = { key: string; label: string; csv?: string; fmt: Fmt; total?: boolean; get?: (r: ReportRow) => string | number | null; empty?: string; href?: (r: ReportRow) => string };

export const marginOf = (profit: unknown, sales: unknown) => (profit == null || !Number(sales) ? null : (Number(profit) / Number(sales)) * 100);

export const REPORTS: { id: ReportKind; label: string; about: string; cols: Col[] }[] = [
  {
    id: "products",
    label: "Sales by product",
    about: "Each product option sold in the range, with units sold. Profit is the selling price with GST less the cost price (purchase + GST); refunded items are left out.",
    cols: [
      { key: "product", label: "Product", fmt: "text" },
      { key: "option", label: "Option", fmt: "text" },
      { key: "gst_rate", label: "GST %", fmt: "count" },
      { key: "sold", label: "Units sold", fmt: "count", total: true },
      { key: "gross", label: "Gross sales (at shelf price)", csv: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales (after returns)", csv: "Net sales", fmt: "money", total: true },
      { key: "sales", label: "Sales with GST (after returns)", csv: "Sales with GST", fmt: "money", total: true },
      { key: "sales_ex_gst", label: "Sales without GST", fmt: "money", total: true },
      { key: "cost", label: "Cost price", fmt: "money", total: true, empty: "No cost" },
      { key: "profit", label: "Profit", fmt: "money", total: true },
      { key: "margin", label: "Margin", fmt: "pct", get: (r) => marginOf(r.profit, r.sales) },
    ],
  },
  {
    id: "channels",
    label: "Sales by channel",
    about: "Online orders and sales at the counter till, side by side: how many, items, sales with GST, refunds, and the average sale. Cancelled, unpaid and test orders are left out.",
    cols: [
      { key: "channel", label: "Channel", fmt: "text" },
      { key: "orders", label: "Sales", fmt: "count", total: true },
      { key: "items", label: "Items", fmt: "count", total: true },
      { key: "gross", label: "Sales with GST", fmt: "money", total: true },
      { key: "refunds", label: "Refunds", fmt: "money", total: true },
      { key: "net", label: "After refunds", fmt: "money", total: true },
      { key: "avg", label: "Average sale", fmt: "money" },
    ],
  },
  {
    id: "customers",
    label: "Sales by customer",
    about: "Everyone who ordered in the range. Guests are grouped by email.",
    cols: [
      { key: "name", label: "Customer", fmt: "text", get: (r) => `${r.name}${r.guest ? " (guest)" : ""}` },
      { key: "email", label: "Email", fmt: "text" },
      { key: "phone", label: "Phone", fmt: "text" },
      { key: "orders", label: "Orders", fmt: "count", total: true },
      { key: "items", label: "Items", fmt: "count", total: true },
      { key: "gross", label: "Gross sales (at shelf price)", csv: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales (after returns)", csv: "Net sales", fmt: "money", total: true },
      { key: "average", label: "Average order value", csv: "Average order", fmt: "money" },
      { key: "first_order", label: "First order", fmt: "day" },
      { key: "last_order", label: "Last order", fmt: "day" },
    ],
  },
  {
    id: "stock",
    label: "Stock",
    about: "Every product option, fastest to run out first. Days left assumes sales carry on at the range's daily rate.",
    cols: [
      { key: "product", label: "Product", fmt: "text" },
      { key: "option", label: "Option", fmt: "text" },
      { key: "in_stock", label: "In stock", fmt: "count", total: true, empty: "Not counted" },
      { key: "sold", label: "Sold", fmt: "count", total: true },
      { key: "per_day", label: "Per day", fmt: "num" },
      { key: "days_left", label: "Days left", fmt: "count", empty: "–" },
      { key: "sell_through", label: "Sell-through", fmt: "pct" },
    ],
  },
  {
    id: "finance",
    label: "Finance by month",
    about: "One row per month. Payment received is what customers paid: net sales, delivery and any GST added on top.",
    cols: [
      { key: "month", label: "Month", fmt: "month" },
      { key: "orders", label: "Orders", fmt: "count", total: true },
      { key: "gross", label: "Gross sales (at shelf price)", csv: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales (after returns)", csv: "Net sales", fmt: "money", total: true },
      { key: "delivery", label: "Delivery", fmt: "money", total: true },
      { key: "gst", label: "GST", fmt: "money", total: true },
      { key: "collected", label: "Payment received", csv: "Collected", fmt: "money", total: true },
      { key: "cost", label: "Cost", fmt: "money", total: true },
      { key: "profit", label: "Gross profit", fmt: "money", total: true },
      { key: "gst_to_pay", label: "Net GST payable", csv: "GST to pay", fmt: "money", total: true },
    ],
  },
  {
    id: "gst",
    label: "GST by state",
    about: "Taxable value and GST by month, place of supply and rate, as GSTR-1 asks for B2C sales. Cancelled and refunded orders are left out. Delivery is not taxed here.",
    cols: [
      { key: "month", label: "Month", fmt: "month" },
      { key: "place", label: "Place of supply", fmt: "text" },
      { key: "rate", label: "Rate", fmt: "pct" },
      { key: "orders", label: "Orders", fmt: "count", total: true },
      { key: "taxable", label: "Taxable value", fmt: "money", total: true },
      { key: "cgst", label: "CGST", fmt: "money", total: true },
      { key: "sgst", label: "SGST", fmt: "money", total: true },
      { key: "igst", label: "IGST", fmt: "money", total: true },
      { key: "gst", label: "Total GST", fmt: "money", total: true },
    ],
  },
  {
    id: "couriers",
    label: "Deliveries by courier",
    about: "Orders shipped in the range, by courier: how many arrived, how many are still out, and how many days delivery took from shipping. Failed counts orders with at least one failed attempt; came back, those returned to the shop.",
    cols: [
      { key: "courier", label: "Courier", fmt: "text" },
      { key: "shipped", label: "Shipped", fmt: "count", total: true },
      { key: "delivered", label: "Delivered", fmt: "count", total: true },
      { key: "delivered_rate", label: "Delivered %", fmt: "pct" },
      { key: "on_the_way", label: "On the way", fmt: "count", total: true },
      { key: "late", label: "Late", fmt: "count", total: true },
      { key: "failed", label: "Failed", fmt: "count", total: true },
      { key: "came_back", label: "Returned to origin (RTO)", csv: "Came back", fmt: "count", total: true },
      { key: "avg_days", label: "Avg days", fmt: "num" },
      { key: "slowest", label: "Slowest (days)", fmt: "num" },
    ],
  },
  {
    id: "places",
    label: "Deliveries by state",
    about: "Orders shipped in the range, by the state they went to: where deliveries are slow or fail most.",
    cols: [
      { key: "state", label: "State", fmt: "text" },
      { key: "shipped", label: "Shipped", fmt: "count", total: true },
      { key: "delivered", label: "Delivered", fmt: "count", total: true },
      { key: "delivered_rate", label: "Delivered %", fmt: "pct" },
      { key: "on_the_way", label: "On the way", fmt: "count", total: true },
      { key: "late", label: "Late", fmt: "count", total: true },
      { key: "failed", label: "Failed", fmt: "count", total: true },
      { key: "avg_days", label: "Avg days", fmt: "num" },
      { key: "slowest", label: "Slowest (days)", fmt: "num" },
    ],
  },
  {
    id: "late",
    label: "Late deliveries",
    about: "Every order shipped and still not delivered after the days set in Settings › Delivery (7 unless changed), longest first, whatever the dates above. Chase these with the courier or the customer.",
    cols: [
      { key: "order", label: "Order", fmt: "text", href: (r) => `/admin/orders/view?id=${r.order_id}` },
      { key: "customer", label: "Customer", fmt: "text" },
      { key: "city", label: "City", fmt: "text" },
      { key: "state", label: "State", fmt: "text" },
      { key: "courier", label: "Courier", fmt: "text" },
      { key: "tracking", label: "Tracking", fmt: "text" },
      { key: "shipped", label: "Shipped", fmt: "day" },
      { key: "days_out", label: "Days out", fmt: "count" },
      { key: "failed", label: "Failed attempts", fmt: "count", empty: "–" },
    ],
  },
  {
    id: "product_funnel",
    label: "Most viewed products",
    about: "Each product opened in the range: how often it was looked at, added to a cart and bought. A high view count with few carts usually means the price, photos or description need a look.",
    cols: [
      { key: "product", label: "Product", fmt: "text", href: (r) => `/admin/products/edit?id=${r.product_id}` },
      { key: "category", label: "Category", fmt: "text" },
      { key: "views", label: "Views", fmt: "count", total: true },
      { key: "adds", label: "Added to cart", fmt: "count", total: true },
      { key: "cart_rate", label: "View → cart", fmt: "pct" },
      { key: "orders", label: "Orders", fmt: "count", total: true },
      { key: "units", label: "Units bought", fmt: "count", total: true },
      { key: "buy_rate", label: "View → order", fmt: "pct" },
      { key: "sales", label: "Sales", fmt: "money", total: true },
    ],
  },
  {
    id: "exit_pages",
    label: "Drop-off pages",
    about: "The pages visits ended on without an order. Exit rate is the share of that page's views that were the last thing seen. A checkout or cart page high up here is worth a look.",
    cols: [
      { key: "page", label: "Page", fmt: "text" },
      { key: "views", label: "Views", fmt: "count", total: true },
      { key: "entries", label: "Visits started here", csv: "Entries", fmt: "count", total: true },
      { key: "exits", label: "Visits ended here", csv: "Exits", fmt: "count", total: true },
      { key: "exit_rate", label: "Exit rate", fmt: "pct" },
    ],
  },
  {
    id: "worst_sellers",
    label: "Worst sellers",
    about: "Every product on the shop, fewest sold in the range first, with how often it was viewed and the stock sitting on it. Few views: help people find it. Many views, no sales: check the price.",
    cols: [
      { key: "product", label: "Product", fmt: "text", href: (r) => `/admin/products/edit?id=${r.product_id}` },
      { key: "category", label: "Category", fmt: "text" },
      { key: "units", label: "Units sold", fmt: "count", total: true },
      { key: "sales", label: "Sales", fmt: "money", total: true },
      { key: "views", label: "Views", fmt: "count", total: true },
      { key: "in_stock", label: "In stock", fmt: "count", total: true, empty: "Not counted" },
      { key: "stock_value", label: "Stock at selling price", csv: "Stock value", fmt: "money", total: true },
      { key: "last_sold", label: "Last sold (ever)", csv: "Last sold", fmt: "day", empty: "Never" },
      { key: "listed", label: "Listed", fmt: "day" },
    ],
  },
  {
    id: "returns",
    label: "Returns by product",
    about: "Units delivered from orders in the range against units customers asked to return, with the reasons they picked.",
    cols: [
      { key: "product", label: "Product", fmt: "text", href: (r) => `/admin/products/edit?id=${r.product_id}` },
      { key: "delivered", label: "Delivered", fmt: "count", total: true },
      { key: "returned", label: "Asked to return", csv: "Returned", fmt: "count", total: true },
      { key: "return_rate", label: "Return rate", fmt: "pct" },
      { key: "requests", label: "Requests", fmt: "count", total: true },
      { key: "accepted", label: "Accepted", fmt: "count", total: true },
      { key: "reasons", label: "Reasons", fmt: "text", get: (r) => String(r.reasons ?? "").split(", ").filter(Boolean).map(reasonLabel).join(", ") },
    ],
  },
  {
    id: "return_reasons",
    label: "Return reasons",
    about: "Return requests made in the range, by the reason the customer picked.",
    cols: [
      { key: "reason", label: "Reason", fmt: "text", get: (r) => reasonLabel(String(r.reason)) },
      { key: "requests", label: "Requests", fmt: "count", total: true },
      { key: "accepted", label: "Accepted", fmt: "count", total: true },
      { key: "declined", label: "Declined", fmt: "count", total: true },
      { key: "units", label: "Units", fmt: "count", total: true },
    ],
  },
  {
    id: "new_customers",
    label: "New customers",
    about: "Accounts made each week, and how many of them have ordered since.",
    cols: [
      { key: "week", label: "Week of", fmt: "day" },
      { key: "new_customers", label: "New accounts", csv: "New customers", fmt: "count", total: true },
      { key: "ordered", label: "Have ordered", csv: "Ordered", fmt: "count", total: true },
      { key: "ordered_rate", label: "Ordered %", fmt: "pct" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    about: "Visits by the campaign tags (utm_source / utm_medium / utm_campaign) on the link that brought them, with carts, orders and sales. (none) is visits without tags.",
    cols: [
      { key: "source", label: "Source", fmt: "text" },
      { key: "medium", label: "Medium", fmt: "text" },
      { key: "campaign", label: "Campaign", fmt: "text" },
      { key: "visits", label: "Visits", fmt: "count", total: true },
      { key: "carts", label: "Added to cart", csv: "Carts", fmt: "count", total: true },
      { key: "orders", label: "Orders", fmt: "count", total: true },
      { key: "sales", label: "Sales", fmt: "money", total: true },
      { key: "conversion", label: "Conversion", fmt: "pct" },
    ],
  },
  {
    id: "refunds",
    label: "Refunds",
    about: "Every refund made in the range, newest first, with the GST it took back and why.",
    cols: [
      { key: "order", label: "Order", fmt: "text", href: (r) => `/admin/orders/view?id=${r.order_id}` },
      { key: "refunded_at", label: "Refunded", fmt: "day" },
      { key: "customer", label: "Customer", fmt: "text" },
      { key: "email", label: "Email", fmt: "text" },
      { key: "items", label: "Items", fmt: "text" },
      { key: "amount", label: "Amount", fmt: "money", total: true },
      { key: "subtotal", label: "Goods", fmt: "money", total: true },
      { key: "shipping", label: "Delivery", fmt: "money", total: true },
      { key: "gst", label: "GST", fmt: "money", total: true },
      { key: "returned", label: "Came back", fmt: "text", get: (r) => (r.returned ? "Yes" : "No") },
      { key: "reason", label: "Reason", fmt: "text" },
    ],
  },
];

export const REASONS: Record<string, string> = {
  damaged: "Arrived damaged",
  wrong_item: "Wrong item",
  not_as_described: "Not as described",
  quality: "Quality",
  changed_mind: "Changed mind",
  other: "Something else",
  not_given: "Not given",
};
export const reasonLabel = (c: string) => REASONS[c] ?? c;

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
export const n = (v: unknown) => Number(v);

export function show(v: string | number | null | undefined, c: Col): string {
  if (v == null || v === "") return c.empty ?? "–";
  switch (c.fmt) {
    case "money":
      return money(Math.round(n(v) * 100) / 100);
    case "count":
      return n(v).toLocaleString("en-IN");
    case "num":
      return n(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
    case "pct":
      return `${n(v).toFixed(1).replace(/\.0$/, "")}%`;
    case "day":
      return dayLabel(String(v));
    case "month":
      return MONTH.format(new Date(`${v}T12:00:00Z`));
    default:
      return String(v);
  }
}

export const left = (c: Col) => c.fmt === "text" || c.fmt === "day" || c.fmt === "month";
export const value = (r: ReportRow, c: Col) => (c.get ? c.get(r) : (r[c.key] as string | number | null));

export function csv(rows: ReportRow[], cols: Col[]) {
  const cell = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const raw = (r: ReportRow, c: Col) => {
    const v = value(r, c);
    if (v == null) return "";
    if (c.fmt === "pct" && c.get) return Number(v).toFixed(1);
    if (c.fmt === "month") return String(v).slice(0, 7);
    return v;
  };
  return "﻿" + [cols.map((c) => cell(c.csv ?? c.label)), ...rows.map((r) => cols.map((c) => cell(raw(r, c))))].map((l) => l.join(",")).join("\r\n");
}

// ---------------------------------------------------------------- the till's reports (0086)
// Aronium's own sales reports, for the counter and the website alike; each
// narrows by Channel and Cashier in Reporting's filter.
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const orderLink = (r: ReportRow) => `/admin/orders/view?id=${r.order_id}`;
export const TILL_REPORTS: { id: ReportKind; label: string; about: string; cols: Col[] }[] = [
  { id: "daily", label: "Daily sales", about: "Sales day by day: how many, items, sales with GST, refunds and what's left after them.", cols: [{ key: "day", label: "Day", fmt: "day" }, { key: "sales", label: "Sales", fmt: "count", total: true }, { key: "items", label: "Items", fmt: "count", total: true }, { key: "total", label: "Sales with GST", fmt: "money", total: true }, { key: "refunds", label: "Refunds", fmt: "money", total: true }, { key: "net", label: "After refunds", fmt: "money", total: true }] },
  { id: "hourly", label: "Hourly sales", about: "Sales by the hour of the day they were made, India time, over the dates chosen.", cols: [{ key: "hour", label: "Hour", fmt: "text" }, { key: "sales", label: "Sales", fmt: "count", total: true }, { key: "total", label: "Sales with GST", fmt: "money", total: true }, { key: "average", label: "Average sale", fmt: "money" }] },
  { id: "hourly_groups", label: "Hourly sales by product groups", about: "Each hour of the day, split by product group (category): pieces sold and their value.", cols: [{ key: "hour", label: "Hour", fmt: "text" }, { key: "group", label: "Product group", fmt: "text" }, { key: "qty", label: "Pieces", fmt: "count", total: true }, { key: "total", label: "Value", fmt: "money", total: true }] },
  { id: "pay_types", label: "Payment types", about: "How sales were paid, by way of paying. Money collected later on account is in Collected credit payments.", cols: [{ key: "method", label: "Payment type", fmt: "text" }, { key: "payments", label: "Payments", fmt: "count", total: true }, { key: "amount", label: "Amount", fmt: "money", total: true }] },
  { id: "pay_users", label: "Payment types by users", about: "Each staff member's payments taken, by way of paying. Website: paid on orders no one at the shop recorded.", cols: [{ key: "who", label: "User", fmt: "text" }, { key: "method", label: "Payment type", fmt: "text" }, { key: "payments", label: "Payments", fmt: "count", total: true }, { key: "amount", label: "Amount", fmt: "money", total: true }] },
  { id: "pay_customers", label: "Payment types by customers", about: "Each customer's payments, by way of paying.", cols: [{ key: "who", label: "Customer", fmt: "text" }, { key: "method", label: "Payment type", fmt: "text" }, { key: "payments", label: "Payments", fmt: "count", total: true }, { key: "amount", label: "Amount", fmt: "money", total: true }] },
  { id: "users", label: "Users", about: "Sales by who made them: the cashier on the till, the staff member who took an order, or the website when the customer ordered online.", cols: [{ key: "user", label: "User", fmt: "text" }, { key: "channel", label: "Channel", fmt: "text" }, { key: "sales", label: "Sales", fmt: "count", total: true }, { key: "total", label: "Sales with GST", fmt: "money", total: true }, { key: "average", label: "Average sale", fmt: "money" }] },
  { id: "items", label: "Item list", about: "Every item sold, with pieces, value and any discount given at the counter.", cols: [{ key: "product", label: "Product", fmt: "text" }, { key: "option", label: "Option", fmt: "text" }, { key: "qty", label: "Pieces", fmt: "count", total: true }, { key: "total", label: "Value", fmt: "money", total: true }, { key: "discount", label: "Discount", fmt: "money", total: true }] },
  { id: "till_refunds", label: "Refunds (till)", about: "Refunds made in the range, with how the money went back (the till records it; refunds made from an order's page say Not recorded).", cols: [{ key: "day", label: "Day", fmt: "day" }, { key: "order", label: "Order", fmt: "text", href: orderLink }, { key: "customer", label: "Customer", fmt: "text" }, { key: "channel", label: "Channel", fmt: "text" }, { key: "amount", label: "Amount", fmt: "money", total: true }, { key: "method", label: "Paid back by", fmt: "text" }, { key: "reason", label: "Reason", fmt: "text" }, { key: "by", label: "By", fmt: "text" }] },
  { id: "unpaid", label: "Unpaid sales (on account)", about: "Every sale on account with money still owed, oldest first, whatever the dates: what each customer owes and for how many days.", cols: [{ key: "day", label: "Day", fmt: "day" }, { key: "order", label: "Sale", fmt: "text", href: orderLink }, { key: "customer", label: "Customer", fmt: "text" }, { key: "phone", label: "Phone", fmt: "text" }, { key: "total", label: "Total", fmt: "money", total: true }, { key: "owed", label: "Owed", fmt: "money", total: true }, { key: "days", label: "Days", fmt: "count" }] },
  { id: "collected", label: "Collected credit payments", about: "Money collected against sales on account, and what each customer still owed after.", cols: [{ key: "day", label: "Day", fmt: "day" }, { key: "customer", label: "Customer", fmt: "text" }, { key: "method", label: "Payment type", fmt: "text" }, { key: "reference", label: "Reference", fmt: "text" }, { key: "amount", label: "Amount", fmt: "money", total: true }, { key: "balance_after", label: "Still owed", fmt: "money" }, { key: "by", label: "By", fmt: "text" }] },
  { id: "floats", label: "Starting cash entries", about: "Each day the cash drawer was opened: its float, and at closing the cash expected, counted, and over or short.", cols: [{ key: "opened", label: "Opened", fmt: "text", get: (r) => when(r.opened) }, { key: "by", label: "By", fmt: "text" }, { key: "float", label: "Float", fmt: "money", total: true }, { key: "closed", label: "Closed", fmt: "text", get: (r) => when(r.closed) }, { key: "expected", label: "Expected", fmt: "money" }, { key: "counted", label: "Counted", fmt: "money" }, { key: "difference", label: "Over / short", fmt: "money", total: true }, { key: "note", label: "Note", fmt: "text" }] },
  { id: "cash_moves", label: "Cash in / out", about: "Cash put into or taken out of the drawer, and why.", cols: [{ key: "when", label: "When", fmt: "text", get: (r) => when(r.when) }, { key: "kind", label: "In / out", fmt: "text" }, { key: "amount", label: "Amount", fmt: "money", total: true }, { key: "reason", label: "Why", fmt: "text" }, { key: "by", label: "By", fmt: "text" }] },
  { id: "voids", label: "Voided items", about: "Lines taken off a ticket, and whole tickets voided, before payment at the till.", cols: [{ key: "when", label: "When", fmt: "text", get: (r) => when(r.when) }, { key: "kind", label: "Voided", fmt: "text" }, { key: "product", label: "Item", fmt: "text" }, { key: "qty", label: "Pieces", fmt: "count", total: true }, { key: "value", label: "Value", fmt: "money", total: true }, { key: "reason", label: "Reason", fmt: "text" }, { key: "by", label: "By", fmt: "text" }] },
  { id: "discounts", label: "Discounts granted", about: "Each sale with a discount: the listed value, what was charged, and the discount. Exact for counter sales made after 0086.", cols: [{ key: "day", label: "Day", fmt: "day" }, { key: "order", label: "Sale", fmt: "text", href: orderLink }, { key: "customer", label: "Customer", fmt: "text" }, { key: "list", label: "Listed", fmt: "money", total: true }, { key: "charged", label: "Charged", fmt: "money", total: true }, { key: "discount", label: "Discount", fmt: "money", total: true }, { key: "pct", label: "%", fmt: "pct" }] },
  { id: "item_discounts", label: "Item discounts", about: "Every discounted line: its listed and charged price per piece, and the discount.", cols: [{ key: "day", label: "Day", fmt: "day" }, { key: "order", label: "Sale", fmt: "text", href: orderLink }, { key: "product", label: "Item", fmt: "text" }, { key: "option", label: "Option", fmt: "text" }, { key: "qty", label: "Pieces", fmt: "count", total: true }, { key: "list_price", label: "Listed", fmt: "money" }, { key: "price", label: "Charged", fmt: "money" }, { key: "discount", label: "Discount", fmt: "money", total: true }, { key: "pct", label: "%", fmt: "pct" }] },
];
REPORTS.push(...TILL_REPORTS);
