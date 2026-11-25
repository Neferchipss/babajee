"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { REASON } from "@/components/admin/editor/Details";
import { errText, stockHistory, type StockMove } from "@/lib/orders-db";
import { billNumbers } from "@/lib/stock-in/db";
import AroniumStockHistory from "@/components/admin/shells/AroniumStockHistory";
import { useAdminStyle } from "@/lib/admin-style";
import "../stock/stock.css";

// Inventory › Stock history: every change to stock in the shop, newest first:
// sales, cancellations and refunds put back, bills, adjustments, counting
// switched on or off. Read only; changes are made on Stock and Purchase bills.
const PAGE = 200;
type Kind = "all" | "orders" | "bills" | "adjust";
const KIND: Record<Kind, { label: string; reasons: StockMove["reason"][] | null }> = {
  all: { label: "Everything", reasons: null },
  orders: { label: "Orders", reasons: ["sale", "cancel", "refund", "return", "edit", "undo"] },
  bills: { label: "Bills", reasons: ["stock_in", "void"] },
  adjust: { label: "Adjustments", reasons: ["correction", "manual"] },
};

export default function StockHistoryPage() {
  return useAdminStyle() === "aronium" ? <AroniumStockHistory /> : <StockHistoryOriginal />;
}

function StockHistoryOriginal() {
  const [moves, setMoves] = useState<StockMove[] | null>(null);
  const [bills, setBills] = useState<Map<string, string>>(new Map());
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");

  async function load(before?: string) {
    setBusy(true);
    try {
      const page = await stockHistory(undefined, { limit: PAGE, before });
      const names = await billNumbers([...new Set(page.flatMap((m) => (m.receipt_id ? [m.receipt_id] : [])))]).catch(() => new Map<string, string>());
      setBills((b) => new Map([...b, ...names]));
      setMoves((m) => [...(before ? (m ?? []) : []), ...page]);
      setMore(page.length === PAGE);
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

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const reasons = KIND[kind].reasons;
    return (moves ?? []).filter(
      (m) =>
        (!reasons || reasons.includes(m.reason)) &&
        words.every((w) => `${m.product_name} ${m.label} ${m.order_number ?? ""} ${m.note} ${(m.receipt_id && bills.get(m.receipt_id)) || ""}`.toLowerCase().includes(w)),
    );
  }, [moves, kind, q, bills]);

  return (
    <div className="inv">
      <header className="adm-pagehead">
        <h1>Stock history</h1>
        <p>
          Every change to stock, newest first. To change stock, use <Link href="/admin/inventory/stock">Stock</Link> or a <Link href="/admin/inventory/purchases">purchase bill</Link>.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}
      <div className="inv-tools">
        <input className="adm-input" type="search" placeholder="Search by product, option, order, bill or note" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stock history" />
      </div>
      <div className="adm-chips" role="tablist" style={{ margin: "10px 0 12px" }}>
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`adm-chip ${kind === k ? "is-on" : ""}`} onClick={() => setKind(k)}>
            {KIND[k].label}
          </button>
        ))}
      </div>
      <section className="adm-card inv-history">
        {moves === null ? (
          <p className="adm-muted">Loading.</p>
        ) : !shown.length ? (
          <p className="adm-muted">{moves.length ? "Nothing matches." : "No stock changes yet."}</p>
        ) : (
          <table className="adm-table inv-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>What</th>
                <th className="r">Change</th>
                <th className="r">After</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td className="adm-small">{new Date(m.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                  <td>
                    {m.product_id ? <Link href={`/admin/inventory/stock?product=${m.product_id}`}>{m.product_name}</Link> : m.product_name}
                    {m.label && m.label !== "Default" && <small className="adm-muted"> · {m.label}</small>}
                  </td>
                  <td>
                    {REASON[m.reason] ?? m.reason}
                    {m.order_id && m.order_number && (
                      <>
                        {" · "}
                        <Link href={`/admin/orders/view?id=${m.order_id}`}>{m.order_number}</Link>
                      </>
                    )}
                    {m.receipt_id && bills.get(m.receipt_id) && (
                      <>
                        {" · "}
                        <Link href={`/admin/inventory/purchases/bill?id=${m.receipt_id}`}>bill {bills.get(m.receipt_id)}</Link>
                      </>
                    )}
                    {m.note && <small className="adm-muted"> · {m.note}</small>}
                  </td>
                  <td className={`r ${m.delta < 0 ? "adm-profit-neg" : "adm-profit-pos"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td className="r">{m.qty_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {moves && more && (
          <button type="button" className="adm-btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => load(moves[moves.length - 1]?.created_at)}>
            {busy ? "Loading" : "Show older"}
          </button>
        )}
      </section>
    </div>
  );
}
