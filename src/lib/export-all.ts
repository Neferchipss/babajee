"use client";

import { strToU8, zipSync } from "fflate";
import { getSupabase } from "./supabase";

// "Download all data" (Admin > Settings, migration 0049): every table of the
// shop as raw CSV in one zip, for analysis in pandas, R, DuckDB or a
// spreadsheet. Raw on purpose: ids on every row so tables join, timestamps
// as stored (ISO 8601, UTC offset), money as plain rupee numbers, nothing
// summed or renamed. A README lists every table and column. Each download
// is written to the activity log.
type TableInfo = { table: string; rows: number; columns: { name: string; type: string }[] };

const PAGE = 5000;

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// what each table is, for the README; tables not listed get their name only
const ABOUT: Record<string, string> = {
  orders: "One row per order. total is what the customer pays (rupees). session_id joins to site_events.session_id (orders since 2026-11-13).",
  order_items: "One row per product line in an order; order_id -> orders.id, variant_id -> product_variants.id. unit_price and GST bracket are frozen at order time.",
  order_item_costs: "Cost per order line (purchase price + GST), frozen at order time; for profit.",
  order_events: "Every status change of an order (the order timeline).",
  order_refunds: "Refunds; order_refund_items holds the lines refunded.",
  payments: "Payments recorded against orders.",
  shipments: "Courier, tracking and delivery of each order.",
  products: "The catalogue. category_id -> categories.id.",
  product_variants: "Each buyable option of a product (size, colour); price and stock_qty live here.",
  variant_costs: "Buying price of each variant.",
  stock_daily: "Stock, price and whether it was on the shelf, per variant per day (India time). Starts 2026-11-13. Use it to tell low demand from sold out.",
  stock_movements: "Manual stock changes.",
  profiles: "Accounts. role = 'admin' is staff; is_test marks seeded test customers (filter them out). email is from the login.",
  addresses: "Saved delivery addresses.",
  site_events: "Every tracked visit event. session_id = one visit (one browser tab); visitor_id = one browser across visits (since 2026-11-13); kind: view, cart, checkout, product, add, search (label = query, value = products found), step (checkout steps); campaign = utm source/medium/campaign of the visit; profile_id when signed in. Staff are never recorded.",
  login_events: "Sign-ins and failed sign-ins, with browser and IP (kept 180 days).",
  saved_products: "Products customers saved for later.",
  carts: "Saved carts; cart_items holds their lines.",
  product_reviews: "Customer reviews.",
  order_requests: "Cancellation and return requests.",
  audit_log: "Every change made in the admin: who, when, what.",
};

function readme(tables: TableInfo[], at: Date): string {
  const lines = [
    "# Babajee data export",
    "",
    `Exported ${at.toISOString()} (UTC). One CSV per table, UTF-8, header row, comma separated.`,
    "",
    "Conventions",
    "- Timestamps are ISO 8601 with offset (UTC). The shop runs on India time (UTC+05:30).",
    "- Money is in rupees, plain numbers.",
    "- Ids (uuid) join tables: x_id -> x.id. JSON columns are JSON text.",
    "- Empty cell = null.",
    "- Filter out test customers with profiles.is_test, and cancelled orders by status.",
    "",
  ];
  for (const t of tables) {
    lines.push(`## ${t.table}.csv (${t.rows} rows)`, "");
    if (ABOUT[t.table]) lines.push(ABOUT[t.table], "");
    for (const c of t.columns) lines.push(`- ${c.name}: ${c.type}`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function downloadAllData(onProgress: (text: string) => void): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Accounts are not connected yet.");
  const { data: list, error } = await sb.rpc("admin_export_tables");
  if (error) throw error;
  const tables = list as TableInfo[];
  const total = tables.reduce((n, t) => n + Number(t.rows), 0);
  const files: Record<string, Uint8Array> = {};
  let done = 0;
  for (const t of tables) {
    const cols = t.columns.map((c) => c.name);
    const out: string[] = [cols.map(cell).join(",")];
    for (let offset = 0; offset < Number(t.rows); offset += PAGE) {
      onProgress(`${t.table}: ${Math.min(offset + PAGE, Number(t.rows)).toLocaleString("en-IN")} of ${Number(t.rows).toLocaleString("en-IN")} · ${Math.round((done / Math.max(total, 1)) * 100)}% overall`);
      const { data, error: e } = await sb.rpc("admin_export", { p_table: t.table, p_offset: offset, p_limit: PAGE });
      if (e) throw e;
      const rows = (data ?? []) as Record<string, unknown>[];
      for (const r of rows) out.push(cols.map((c) => cell(r[c])).join(","));
      done += rows.length;
      if (rows.length < PAGE) break;
    }
    // the BOM lets Excel read rupee signs and Hindi names correctly
    files[`${t.table}.csv`] = strToU8("﻿" + out.join("\r\n") + "\r\n");
  }
  const at = new Date();
  files["README.md"] = strToU8(readme(tables, at));
  onProgress("Packing the zip");
  const zip = zipSync(files, { level: 6 });
  await sb.rpc("admin_log_export");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  a.download = `babajee-data-${at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
