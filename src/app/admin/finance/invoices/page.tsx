"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RangePicker, useRange } from "@/components/admin/RangePicker";
import { money } from "@/components/admin/ui";
import type { CreditNoteRow } from "@/lib/credit-note";
import "../finance.css";
import { creditNotesIn, errText, getOrders, invoicedOrders, uninvoicedPaid, type Order } from "@/lib/orders-db";

// Finance › Invoices and credit notes: every tax document dated in the range,
// with its order, buyer and amount. Invoices are issued when an order is paid
// (0051); credit notes when an invoiced order is refunded.
type Data = { ask: string; invoices: Order[]; notes: CreditNoteRow[]; noteOrders: Map<string, Order>; missing: number };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function InvoicesPage() {
  const [range, setRange] = useRange("month");
  const [tab, setTab] = useState<"invoices" | "notes">("invoices");
  const ask = `${range.from}|${range.to}`;
  const [res, setRes] = useState<Data | { ask: string; err: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [invoices, notes, missing] = await Promise.all([invoicedOrders(range.from, range.to), creditNotesIn(range.from, range.to), uninvoicedPaid(range.from, range.to)]);
      const noteOrders = new Map((await getOrders([...new Set(notes.map((n) => n.order_id))])).map((o) => [o.id, o]));
      setRes({ ask, invoices: invoices.filter((o) => !o.is_test), notes, noteOrders, missing });
    })().catch((e) => setRes({ ask, err: errText(e) }));
  }, [ask, range.from, range.to]);

  const d = res?.ask === ask && "invoices" in res ? res : null;
  const err = res?.ask === ask && "err" in res ? res.err : "";
  const live = d ? d.invoices.filter((o) => o.status !== "cancelled") : [];
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

  return (
    <div className="anx">
      <header className="adm-pagehead">
        <h1>Invoices and credit notes</h1>
        <p>Every invoice and credit note dated in the range. An invoice is issued when its order is paid; a credit note when an invoiced order is refunded. Neither can be changed once issued.</p>
      </header>
      <div className="anx-bar">
        <RangePicker value={range} onChange={setRange} />
      </div>
      {err && <p className="adm-err">{err}</p>}
      {d && d.missing > 0 && (
        <p className="adm-balance owe">
          <span>
            <b>
              {d.missing} paid order{d.missing === 1 ? " has" : "s have"} no invoice yet
            </b>{" "}
            · paid before invoices were issued automatically. Open {d.missing === 1 ? "its" : "their"} invoice from the order to issue it.
          </span>
        </p>
      )}
      {!d && !err ? (
        <p className="adm-muted">Loading.</p>
      ) : d ? (
        <>
          <div className="fin-kpis">
            <div className="adm-card">
              <span className="adm-muted adm-small">Invoices</span>
              <b>{live.length}</b>
              <small className="adm-muted">{money(sum(live.map((o) => o.total)))} with GST</small>
            </div>
            <div className="adm-card">
              <span className="adm-muted adm-small">GST on them</span>
              <b>{money(sum(live.map((o) => o.tax)))}</b>
              <small className="adm-muted">{live.filter((o) => o.buyer_gstin).length} to businesses (B2B)</small>
            </div>
            <div className="adm-card">
              <span className="adm-muted adm-small">Credit notes</span>
              <b>{d.notes.length}</b>
              <small className="adm-muted">{money(sum(d.notes.map((n) => n.amount)))} refunded</small>
            </div>
          </div>
          <div className="adm-chips" role="tablist" style={{ margin: "12px 0" }}>
            <button type="button" role="tab" aria-selected={tab === "invoices"} className={`adm-chip ${tab === "invoices" ? "is-on" : ""}`} onClick={() => setTab("invoices")}>
              Invoices <b>{d.invoices.length}</b>
            </button>
            <button type="button" role="tab" aria-selected={tab === "notes"} className={`adm-chip ${tab === "notes" ? "is-on" : ""}`} onClick={() => setTab("notes")}>
              Credit notes <b>{d.notes.length}</b>
            </button>
            <span className="ov-gap" />
            {tab === "invoices" && live.length > 0 && (
              <Link className="adm-btn" target="_blank" href={`/admin/orders/print?ids=${live.map((o) => o.id).join(",")}&doc=invoice`}>
                Print all {live.length}
              </Link>
            )}
          </div>
          <section className="adm-card fin-table">
            {tab === "invoices" ? (
              d.invoices.length ? (
                <table className="rpt-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Order</th>
                      <th>Buyer</th>
                      <th className="r">GST</th>
                      <th className="r">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.invoices.map((o) => (
                      <tr key={o.id} className={o.status === "cancelled" ? "adm-muted" : ""}>
                        <td>
                          <b>{o.invoice_number}</b>
                          {o.status === "cancelled" && <span className="adm-pill off"> Cancelled</span>}
                        </td>
                        <td>{day(o.invoice_date ?? o.created_at)}</td>
                        <td>
                          <Link href={`/admin/orders/view?id=${o.id}`}>{o.order_number}</Link>
                        </td>
                        <td>
                          {o.contact_name}
                          {o.buyer_gstin && <small className="adm-muted"> · GSTIN {o.buyer_gstin}</small>}
                        </td>
                        <td className="r">{money(o.tax)}</td>
                        <td className="r">{money(o.total)}</td>
                        <td className="r">
                          <Link href={`/admin/orders/print?ids=${o.id}&doc=invoice`} target="_blank">
                            Print
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="adm-muted">No invoices dated in this range.</p>
              )
            ) : d.notes.length ? (
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>Credit note</th>
                    <th>Date</th>
                    <th>Against invoice</th>
                    <th>Buyer</th>
                    <th className="r">GST</th>
                    <th className="r">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.notes.map((n) => {
                    const o = d.noteOrders.get(n.order_id);
                    return (
                      <tr key={n.id}>
                        <td>
                          <b>{n.number}</b>
                        </td>
                        <td>{day(n.issued_at)}</td>
                        <td>{o ? <Link href={`/admin/orders/view?id=${o.id}`}>{o.invoice_number}</Link> : "–"}</td>
                        <td>{o?.contact_name ?? ""}</td>
                        <td className="r">{money(n.tax)}</td>
                        <td className="r">{money(n.amount)}</td>
                        <td className="r">
                          <Link href={`/admin/orders/print?ids=${n.order_id}&doc=cn`} target="_blank">
                            Print
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="adm-muted">No credit notes dated in this range.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
