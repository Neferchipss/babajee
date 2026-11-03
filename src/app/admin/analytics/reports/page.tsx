"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnalyticsTabs, RangePicker, useRange } from "@/components/admin/RangePicker";
import { money } from "@/components/admin/ui";
import { dayLabel } from "@/lib/dates";
import { errText, report, type ReportKind, type ReportRow } from "@/lib/orders-db";

// Report tables: one date range, one report at a time, every column sortable,
// totals at the foot, and the whole table downloadable as CSV for a
// spreadsheet or the accountant.
type Fmt = "text" | "money" | "count" | "num" | "pct" | "day" | "month";
type Col = { key: string; label: string; fmt: Fmt; total?: boolean; get?: (r: ReportRow) => string | number | null; empty?: string };

const marginOf = (profit: unknown, sales: unknown) => (profit == null || !Number(sales) ? null : (Number(profit) / Number(sales)) * 100);

const REPORTS: { id: ReportKind; label: string; about: string; cols: Col[] }[] = [
  {
    id: "products",
    label: "Sales by product",
    about: "Each product option sold in the range. Sales without GST, cost and profit leave out refunded orders.",
    cols: [
      { key: "product", label: "Product", fmt: "text" },
      { key: "option", label: "Option", fmt: "text" },
      { key: "sold", label: "Sold", fmt: "count", total: true },
      { key: "gross", label: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales", fmt: "money", total: true },
      { key: "sales_ex_gst", label: "Without GST", fmt: "money", total: true },
      { key: "cost", label: "Cost", fmt: "money", total: true, empty: "No cost" },
      { key: "profit", label: "Profit", fmt: "money", total: true },
      { key: "margin", label: "Margin", fmt: "pct", get: (r) => marginOf(r.profit, r.sales_ex_gst) },
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
      { key: "gross", label: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales", fmt: "money", total: true },
      { key: "average", label: "Average order", fmt: "money" },
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
    about: "One row per month. Collected is what customers paid: net sales, delivery and any GST added on top.",
    cols: [
      { key: "month", label: "Month", fmt: "month" },
      { key: "orders", label: "Orders", fmt: "count", total: true },
      { key: "gross", label: "Gross sales", fmt: "money", total: true },
      { key: "returns", label: "Returns", fmt: "money", total: true },
      { key: "net", label: "Net sales", fmt: "money", total: true },
      { key: "delivery", label: "Delivery", fmt: "money", total: true },
      { key: "gst", label: "GST", fmt: "money", total: true },
      { key: "collected", label: "Collected", fmt: "money", total: true },
      { key: "cost", label: "Cost", fmt: "money", total: true },
      { key: "profit", label: "Gross profit", fmt: "money", total: true },
      { key: "gst_to_pay", label: "GST to pay", fmt: "money", total: true },
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
];

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
  return "﻿" + [cols.map((c) => cell(c.label)), ...rows.map((r) => cols.map((c) => cell(raw(r, c))))].map((l) => l.join(",")).join("\r\n");
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
          <p className="adm-muted rpt-empty">Nothing in this range.</p>
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
                            {c.key === "returns" && n(v) > 0 ? `−${show(v, c)}` : show(v, c)}
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
    </div>
  );
}
