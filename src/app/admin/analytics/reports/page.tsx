"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnalyticsTabs, RangePicker, useRange } from "@/components/admin/RangePicker";
import { money } from "@/components/admin/ui";
import { dayLabel } from "@/lib/dates";
import { getReceipt, listReceipts } from "@/lib/stock-in/db";
import { purchasesCsv } from "@/lib/stock-in/purchases-csv";
import { errText, LATE_DAYS, report, type ReportKind, type ReportRow } from "@/lib/orders-db";

// Report tables: one date range, one report at a time, every column sortable,
// totals at the foot, and the whole table downloadable as CSV for a
// spreadsheet or the accountant.
type Fmt = "text" | "money" | "count" | "num" | "pct" | "day" | "month";
// csv: the column's header in the download when it differs from the screen
// label (downloads keep their original headers so saved analyses still work)
type Col = { key: string; label: string; csv?: string; fmt: Fmt; total?: boolean; get?: (r: ReportRow) => string | number | null; empty?: string; href?: (r: ReportRow) => string };

const marginOf = (profit: unknown, sales: unknown) => (profit == null || !Number(sales) ? null : (Number(profit) / Number(sales)) * 100);

const REPORTS: { id: ReportKind; label: string; about: string; cols: Col[] }[] = [
  {
    id: "products",
    label: "Sales by product",
    about: "Each product option sold in the range, with units sold. Profit is the selling price with GST less the cost price (purchase + GST); refunded items are left out.",
    cols: [
      { key: "product", label: "Product", fmt: "text" },
      { key: "option", label: "Option", fmt: "text" },
      { key: "gst_rate", label: "GST %", fmt: "count" },
      { key: "sold", label: "Units sold", fmt: "count", total: true },
      { key: "gross", label: "Gross sales (incl. GST)", csv: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales (excl. GST)", csv: "Net sales", fmt: "money", total: true },
      { key: "sales", label: "Gross sales (incl. GST)", csv: "Sales with GST", fmt: "money", total: true },
      { key: "sales_ex_gst", label: "Without GST", fmt: "money", total: true },
      { key: "cost", label: "Cost price", fmt: "money", total: true, empty: "No cost" },
      { key: "profit", label: "Profit", fmt: "money", total: true },
      { key: "margin", label: "Margin", fmt: "pct", get: (r) => marginOf(r.profit, r.sales) },
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
      { key: "gross", label: "Gross sales (incl. GST)", csv: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales (excl. GST)", csv: "Net sales", fmt: "money", total: true },
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
      { key: "gross", label: "Gross sales (incl. GST)", csv: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales (excl. GST)", csv: "Net sales", fmt: "money", total: true },
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
      { key: "late", label: `Out ${LATE_DAYS}+ days`, fmt: "count", total: true },
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
      { key: "late", label: `Out ${LATE_DAYS}+ days`, fmt: "count", total: true },
      { key: "failed", label: "Failed", fmt: "count", total: true },
      { key: "avg_days", label: "Avg days", fmt: "num" },
      { key: "slowest", label: "Slowest (days)", fmt: "num" },
    ],
  },
  {
    id: "late",
    label: "Late deliveries",
    about: `Every order shipped ${LATE_DAYS} or more days ago and still not delivered, longest first, whatever the dates above. Chase these with the courier or the customer.`,
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

const REASONS: Record<string, string> = {
  damaged: "Arrived damaged",
  wrong_item: "Wrong item",
  not_as_described: "Not as described",
  quality: "Quality",
  changed_mind: "Changed mind",
  other: "Something else",
  not_given: "Not given",
};
const reasonLabel = (c: string) => REASONS[c] ?? c;

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const n = (v: unknown) => Number(v);

function show(v: string | number | null | undefined, c: Col): string {
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

const left = (c: Col) => c.fmt === "text" || c.fmt === "day" || c.fmt === "month";
const value = (r: ReportRow, c: Col) => (c.get ? c.get(r) : (r[c.key] as string | number | null));

function csv(rows: ReportRow[], cols: Col[]) {
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

export default function ReportsPage() {
  const [range, setRange] = useRange();
  const [kind, setKind] = useState<ReportKind>("products");
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  // the answer is kept with the question it answers, so a stale one never shows
  const ask = `${kind}|${range.from}|${range.to}`;
  const [res, setRes] = useState<{ ask: string; rows?: ReportRow[]; err?: string } | null>(null);
  const rows = res?.ask === ask ? (res.rows ?? null) : null;
  const err = res?.ask === ask ? (res.err ?? "") : "";

  useEffect(() => {
    report(kind, range.from, range.to)
      .then((rows) => setRes({ ask, rows }))
      .catch((e) => setRes({ ask, err: errText(e) }));
  }, [ask, kind, range.from, range.to]);

  const def = REPORTS.find((r) => r.id === kind)!;
  // GST split columns only mean something once the shop's state is set
  const noSplit = kind === "gst" && !!rows?.length && rows.every((r) => r.igst == null);
  const cols = def.cols.filter(
    (c) =>
      !(noSplit && ["cgst", "sgst", "igst"].includes(c.key)) &&
      // a text column with nothing in it (no options, no phone numbers) just takes room
      !(c.fmt === "text" && !c.get && rows?.length && rows.every((r) => r[c.key] == null || r[c.key] === "")),
  );

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    const text = c.fmt === "text";
    return [...rows].sort((a, b) => {
      const x = value(a, c);
      const y = value(b, c);
      if (x == null) return 1;
      if (y == null) return -1;
      const d = text ? String(x).localeCompare(String(y)) : n(x) - n(y);
      return sort.desc ? -d : d;
    });
  }, [rows, sort, cols]);

  const totals = useMemo(() => {
    // a column with no numbers at all (no costs yet) totals to a dash, not ₹0
    const t: Record<string, number | null> = {};
    for (const c of cols)
      if (c.total) {
        const got = (rows ?? []).filter((r) => r[c.key] != null);
        t[c.key] = got.length ? got.reduce((s, r) => s + (n(r[c.key]) || 0), 0) : null;
      }
    return t;
  }, [rows, cols]);

  function download() {
    if (!rows) return;
    const blob = new Blob([csv(sorted ?? rows, cols)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `babajee-${kind}-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Purchases: one row per posted supplier-bill line, fetched on demand
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState("");
  async function downloadPurchases() {
    setBuying(true);
    setBuyErr("");
    try {
      const bills = (await listReceipts(range.from, range.to)).filter((r) => r.status === "posted");
      const full = [];
      for (let i = 0; i < bills.length; i += 8) full.push(...(await Promise.all(bills.slice(i, i + 8).map((b) => getReceipt(b.id)))));
      const blob = new Blob([purchasesCsv(full)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `babajee-purchases-${range.from}-to-${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setBuyErr(errText(e));
    } finally {
      setBuying(false);
    }
  }

  // GST returns and Tally registers for the range, as zips
  const [making, setMaking] = useState<"" | "returns" | "registers">("");
  const [retErr, setRetErr] = useState("");
  const [retWarn, setRetWarn] = useState<string[]>([]);
  async function downloadReturns(which: "returns" | "registers") {
    setMaking(which);
    setRetErr("");
    try {
      const m = await import("@/lib/gst-returns-load");
      const d = await m.loadReturns(range.from, range.to);
      setRetWarn(d.warnings);
      const blob = which === "returns" ? m.returnsZip(d, range.from, range.to) : m.registersZip(d, range.from, range.to);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `babajee-${which === "returns" ? "gst-returns" : "tally-registers"}-${range.from}-to-${range.to}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setRetErr(errText(e));
    } finally {
      setMaking("");
    }
  }

  const by = (key: string) => setSort((s) => (s?.key === key ? (s.desc ? { key, desc: false } : null) : { key, desc: true }));

  return (
    <div className="anx">
      <h1 className="sr-only">Reports</h1>
      <AnalyticsTabs on="reports" />
      <div className="anx-bar">
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="rpt-kinds adm-chips" role="group" aria-label="Report">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`adm-chip ${kind === r.id ? "is-on" : ""}`}
            onClick={() => {
              setSort(null);
              setKind(r.id);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>{def.label}</h2>
            <p className="adm-muted adm-small">
              {def.about}
              {noSplit && (
                <>
                  {" "}
                  Set the shop&apos;s state in <Link href="/admin/settings">Settings</Link> to split it into CGST, SGST and IGST.
                </>
              )}
            </p>
          </div>
          <button type="button" className="adm-btn" disabled={!rows?.length} onClick={download}>
            Download CSV
          </button>
        </div>

        {err && <p className="adm-err">{err}</p>}
        {!rows && !err ? (
          <p className="adm-muted">Loading.</p>
        ) : rows && rows.length === 0 ? (
          <p className="adm-muted rpt-empty">{kind === "late" ? `Nothing late: every order shipped ${LATE_DAYS}+ days ago has arrived.` : "Nothing in this range."}</p>
        ) : (
          rows && (
            <div className="rpt-scroll">
              <table className="rpt-table">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} className={left(c) ? "" : "r"} aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                        <button type="button" onClick={() => by(c.key)}>
                          {c.label}
                          <i aria-hidden>{sort?.key === c.key ? (sort.desc ? "↓" : "↑") : ""}</i>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sorted ?? rows).map((r, i) => (
                    <tr key={i}>
                      {cols.map((c) => {
                        const v = value(r, c);
                        const neg = c.fmt === "money" && v != null && n(v) < 0;
                        return (
                          <td key={c.key} className={`${left(c) ? "" : "r"} ${v == null ? "nil" : ""} ${neg ? "neg" : ""}`}>
                            {c.href && v != null ? <Link href={c.href(r)}>{show(v, c)}</Link> : c.key === "returns" && n(v) > 0 ? `−${show(v, c)}` : show(v, c)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {rows.length > 1 && (
                  <tfoot>
                    <tr>
                      {cols.map((c, i) => (
                        <td key={c.key} className={left(c) ? "" : "r"}>
                          {i === 0 ? `Total · ${rows.length} rows` : c.total ? (c.key === "returns" && n(totals[c.key]) > 0 ? `−${show(totals[c.key], { ...c, empty: "–" })}` : show(totals[c.key], { ...c, empty: "–" })) : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )
        )}
      </section>

      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>Purchases</h2>
            <p className="adm-muted adm-small">
              One row per line on each posted stock entry dated in the range (supplier bills, opening stock and quick adds, told apart by the last column): supplier and GSTIN, bill number, product, quantity, price, taxable value, GST rate and the CGST, SGST and IGST, and whether the credit is claimable. Voided entries are left out. Dates are YYYY-MM-DD and numbers are plain, for joining in a spreadsheet.
            </p>
          </div>
          <button type="button" className="adm-btn" disabled={buying} onClick={downloadPurchases}>
            {buying ? "Preparing." : "Download CSV"}
          </button>
        </div>
        {buyErr && <p className="adm-err">{buyErr}</p>}
      </section>

      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>GST returns and Tally registers</h2>
            <p className="adm-muted adm-small">
              For the range above (usually one month). <b>GST returns</b>: the GSTR-1 tables (B2B, B2CL, B2CS, credit notes, HSN summary, document summary) and a GSTR-3B summary with ITC from bills ticked as in GSTR-2B. <b>Tally registers</b>: sales and purchase registers. Built from the invoices, credit notes and supplier bills here; check with the CA before filing.
            </p>
          </div>
          <div className="rpt-btns">
            <button type="button" className="adm-btn" disabled={!!making} onClick={() => downloadReturns("returns")}>
              {making === "returns" ? "Preparing." : "GST returns (zip)"}
            </button>
            <button type="button" className="adm-btn" disabled={!!making} onClick={() => downloadReturns("registers")}>
              {making === "registers" ? "Preparing." : "Tally registers (zip)"}
            </button>
          </div>
        </div>
        {retErr && <p className="adm-err">{retErr}</p>}
        {retWarn.length > 0 && (
          <ul className="adm-small rpt-warn">
            {retWarn.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
