"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { REASON } from "@/components/admin/editor/Details";
import { errText, stockHistory, type StockMove } from "@/lib/orders-db";
import { billNumbers } from "@/lib/stock-in/db";
import { ArEmpty, ArGrid, ArIcon, ArScreen, ArToolbar, menuOf, useArKeys, type ArCol, type ArMenuItem } from "./aronium-kit";
import { ArHelp } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Stock • Stock history, Aronium's Stock history window opened
// for the whole shop: every change to stock, newest first (sales,
// cancellations and refunds put back, bills, adjustments, counting switched
// on or off). Read only: stock is changed on Stock and on purchase bills.
// The filter band is Aronium's (Movement type, then a search); the grid is
// its columns, with Babajee's links to the order or bill behind each row.
const PAGE = 200;
type Kind = "all" | "orders" | "bills" | "adjust";
const KIND: Record<Kind, { label: string; reasons: StockMove["reason"][] | null }> = {
  all: { label: "All movements", reasons: null },
  orders: { label: "Orders", reasons: ["sale", "cancel", "refund", "return", "edit", "undo"] },
  bills: { label: "Purchase bills", reasons: ["stock_in", "void"] },
  adjust: { label: "Adjustments", reasons: ["correction", "manual"] },
};
const stamp = (at: string) => new Date(at).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function AroniumStockHistory() {
  const router = useRouter();
  const [moves, setMoves] = useState<StockMove[] | null>(null);
  const [bills, setBills] = useState<Map<string, string>>(new Map());
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  async function load(before?: string) {
    setBusy(true);
    try {
      const page = await stockHistory(undefined, { limit: PAGE, before });
      const names = await billNumbers([...new Set(page.flatMap((m) => (m.receipt_id ? [m.receipt_id] : [])))]).catch(() => new Map<string, string>());
      setBills((b) => new Map([...(before ? b : []), ...names]));
      setMoves((m) => [...(before ? (m ?? []) : []), ...page]);
      setMore(page.length === PAGE);
      setErr("");
    } catch (e) {
      setErr(errText(e));
      setMoves((m) => m ?? []);
    }
    setBusy(false);
  }
  useEffect(() => {
    // the first page; later pages come from "Show older"
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  useArKeys({ refresh: () => void load() });

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const reasons = KIND[kind].reasons;
    return (moves ?? []).filter(
      (m) =>
        (!reasons || reasons.includes(m.reason)) &&
        words.every((w) => `${m.product_name} ${m.label} ${m.order_number ?? ""} ${m.note} ${(m.receipt_id && bills.get(m.receipt_id)) || ""}`.toLowerCase().includes(w)),
    );
  }, [moves, kind, q, bills]);
  const picked = shown.find((m) => String(m.id) === sel) ?? null;

  const docOf = (m: StockMove) => (m.order_id ? `/admin/orders/view?id=${m.order_id}` : m.receipt_id && bills.get(m.receipt_id) ? `/admin/inventory/purchases/bill?id=${m.receipt_id}` : null);
  const menu = (m: StockMove | null): ArMenuItem[] =>
    menuOf(
      [
        { label: "Open product stock", disabled: !m?.product_id, onClick: () => m?.product_id && router.push(`/admin/inventory/stock?product=${m.product_id}`) },
        { label: m?.order_id ? "Open order" : "Open document", disabled: !m || !docOf(m), onClick: () => m && docOf(m) && router.push(docOf(m)!) },
      ],
      [{ label: "Refresh", key: "F5", onClick: () => void load() }],
    );

  const cols: ArCol<StockMove>[] = [
    { k: "at", label: "Date", render: (m) => stamp(m.created_at), sort: (m) => m.created_at },
    {
      k: "name",
      label: "Product",
      render: (m) => (m.product_id ? <Link href={`/admin/inventory/stock?product=${m.product_id}`}>{m.product_name}</Link> : m.product_name),
      sort: (m) => m.product_name,
    },
    { k: "opt", label: "Option", render: (m) => (m.label && m.label !== "Default" ? m.label : "") },
    { k: "type", label: "Movement type", render: (m) => REASON[m.reason as keyof typeof REASON] ?? m.reason, sort: (m) => m.reason },
    {
      k: "doc",
      label: "Document",
      render: (m) =>
        m.order_id && m.order_number ? (
          <Link href={`/admin/orders/view?id=${m.order_id}`}>{m.order_number}</Link>
        ) : m.receipt_id && bills.get(m.receipt_id) ? (
          <Link href={`/admin/inventory/purchases/bill?id=${m.receipt_id}`}>Bill {bills.get(m.receipt_id)}</Link>
        ) : (
          ""
        ),
    },
    { k: "note", label: "Note", render: (m) => m.note },
    { k: "d", label: "Quantity", right: true, render: (m) => <span className={m.delta < 0 ? "arc-neg" : "arc-pos"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>, sort: (m) => m.delta },
    { k: "after", label: "In stock after", right: true, render: (m) => m.qty_after, sort: (m) => m.qty_after },
  ];

  return (
    <ArScreen className="arc">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "box", label: "Stock", href: "/admin/inventory/stock", title: "Change stock" },
          { icon: "truck", label: "Purchase bills", href: "/admin/inventory/purchases", title: "Stock in from a bill" },
          { icon: "open", label: "Open document", disabled: !picked || !docOf(picked), onClick: () => picked && docOf(picked) && router.push(docOf(picked)!) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <form className="aro-filter" onSubmit={(e) => e.preventDefault()}>
        <label>
          <span>Movement type</span>
          <select className="adm-input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(Object.keys(KIND) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Search</span>
          <input className="adm-input" type="search" placeholder="Product, option, order, bill or note" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span />
        <div className="aro-go">
          <button
            type="button"
            className="art-btn"
            onClick={() => {
              setKind("all");
              setQ("");
            }}
          >
            <ArIcon name="clear" />
            <span>Clear</span>
          </button>
        </div>
      </form>
      <div className="art-sec">
        <h2>Stock movements ({shown.length})</h2>
        <i aria-hidden="true" />
      </div>
      {moves === null ? (
        <p className="arc-note arc-pane">Loading.</p>
      ) : !shown.length ? (
        <ArEmpty title={moves.length ? "Nothing matches" : "No stock changes yet"} />
      ) : (
        <ArGrid cols={cols} rows={shown} keyOf={(m) => String(m.id)} sel={sel} onSel={setSel} onOpen={(m) => docOf(m) && router.push(docOf(m)!)} menu={menu} className="arc-grid" />
      )}
      {moves && more && (
        <div className="arc-more">
          <button type="button" className="arc-btn" disabled={busy} onClick={() => load(moves[moves.length - 1]?.created_at)}>
            {busy ? "Loading" : "Show older"}
          </button>
        </div>
      )}
      <ArHelp open={help} onClose={() => setHelp(false)} title="Stock history">
        <p>Every change to stock in the shop, newest first: sales, cancelled orders and refunds put back, purchase bills and voided bills, and adjustments.</p>
        <p>It is read only. To change stock use Stock (Quick inventory) or a purchase bill. Double-click a row, or right-click it, to open its order or bill.</p>
      </ArHelp>
    </ArScreen>
  );
}
