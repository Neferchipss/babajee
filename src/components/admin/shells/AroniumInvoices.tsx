"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RangePicker, useRange } from "@/components/admin/RangePicker";
import { PreviewLayer } from "@/components/admin/print/ArPrintPreview";
import { invoiceSrc, printFrame } from "@/components/admin/print/printing";
import { toastError } from "@/components/admin/Toaster";
import { money } from "@/components/admin/ui";
import type { CreditNoteRow } from "@/lib/credit-note";
import { creditNotesIn, errText, getOrders, invoicedOrders, uninvoicedPaid, type Order } from "@/lib/orders-db";
import { ArSection, ArToolbar, menuOf, useArKeys, useArMenu } from "./aronium-kit";
import { DocTabs, dmy } from "./aronium-docs";
import "./aronium-screens-docs.css";

// Invoices and credit notes in the Aronium-style design, as an Aronium grid
// screen: the toolbar (Refresh, Open, Print, Save as PDF, Print all), the
// Invoices | Credit notes tabs, the Period, and the documents in a grid
// (double-click opens the order; right-click for its menu). Same data as the
// ordinary page: every tax document dated in the period, invoices issued when
// an order is paid, credit notes when an invoiced order is refunded.
type Data = { ask: string; invoices: Order[]; notes: CreditNoteRow[]; noteOrders: Map<string, Order>; missing: number };
type Tab = "invoices" | "notes";
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

export default function AroniumInvoices() {
  const router = useRouter();
  const [range, setRange] = useRange("month");
  const [tab, setTab] = useState<Tab>("invoices");
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const ask = `${range.from}|${range.to}|${tick}`;
  const [res, setRes] = useState<Data | { ask: string; err: string } | null>(null);
  const menu = useArMenu();

  useEffect(() => {
    (async () => {
      const [invoices, notes, missing] = await Promise.all([invoicedOrders(range.from, range.to), creditNotesIn(range.from, range.to), uninvoicedPaid(range.from, range.to)]);
      const noteOrders = new Map((await getOrders([...new Set(notes.map((n) => n.order_id))])).map((o) => [o.id, o]));
      setRes({ ask, invoices: invoices.filter((o) => !o.is_test), notes, noteOrders, missing });
    })().catch((e) => setRes({ ask, err: errText(e) || "Couldn't load the invoices. Sign in again and retry." }));
  }, [ask, range.from, range.to]);

  const d = res?.ask === ask && "invoices" in res ? res : null;
  const err = res?.ask === ask && "err" in res ? res.err : "";
  const live = d ? d.invoices.filter((o) => o.status !== "cancelled") : [];
  const refresh = () => setTick((t) => t + 1);

  // the selected row: an invoice (order id) or a credit note (its id)
  const inv = tab === "invoices" ? (d?.invoices.find((o) => o.id === sel) ?? null) : null;
  const cn = tab === "notes" ? (d?.notes.find((n) => n.id === sel) ?? null) : null;
  const orderId = inv?.id ?? cn?.order_id ?? null;
  // Print, Save as PDF and Print all go straight to the print window (all the
  // invoices in one job); Print preview shows the selected one first
  const printSrc = inv ? invoiceSrc([inv.id]) : cn ? invoiceSrc([cn.order_id], "cn") : undefined;
  const allSrc = live.length ? invoiceSrc(live.map((o) => o.id)) : undefined;
  const printIt = (src: string | undefined) => src && printFrame(src, ".prt-page", (m) => toastError(new Error(m)));
  const openOrder = (id: string | null) => id && router.push(`/admin/orders/view?id=${id}`);
  const rowMenu = (has: boolean, id: string | null, href: string | undefined) =>
    menuOf(
      [{ label: "Open order", disabled: !has, onClick: () => openOrder(id) }],
      [
        { label: "Print", key: "Ctrl+P", disabled: !has, onClick: () => printIt(href) },
        { label: "Print preview", key: "Ctrl+F2", disabled: !has, onClick: () => href && setPreview(href) },
        { label: "Save as PDF", disabled: !has, onClick: () => printIt(href) },
      ],
      tab === "invoices" ? [{ label: `Print all${live.length ? ` (${live.length})` : ""}`, disabled: !allSrc, onClick: () => printIt(allSrc) }] : [],
      [{ label: "Refresh", key: "F5", onClick: refresh }],
    );

  useArKeys({ refresh, edit: () => openOrder(orderId) });

  return (
    <div className="arx arx-list">
      {preview && <PreviewLayer title={inv?.invoice_number ?? cn?.number ?? "Invoice"} src={preview} onClose={() => setPreview(null)} />}
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: refresh },
          { icon: "open", label: "Open", disabled: !orderId, onClick: () => openOrder(orderId) },
          { icon: "print", label: "Print", onClick: () => printIt(printSrc), disabled: !printSrc },
          { icon: "preview", label: "Print preview", onClick: () => printSrc && setPreview(printSrc), disabled: !printSrc },
          { icon: "pdf", label: "Save as PDF", onClick: () => printIt(printSrc), disabled: !printSrc, title: "Pick “Save as PDF” as the printer" },
          { icon: "print", label: `Print all${tab === "invoices" && live.length ? ` (${live.length})` : ""}`, onClick: () => printIt(allSrc), disabled: tab !== "invoices" || !allSrc },
        ]}
      />
      <DocTabs<Tab>
        tabs={[
          ["invoices", `Invoices (${d?.invoices.length ?? 0})`],
          ["notes", `Credit notes (${d?.notes.length ?? 0})`],
        ]}
        on={tab}
        onPick={(t) => (setTab(t), setSel(null))}
      />
      <div className="arx-filter" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <label className="arx-rangecell">
          <span>Period</span>
          <RangePicker value={range} onChange={setRange} />
        </label>
      </div>
      {err && <p className="adm-err">{err}</p>}
      {d && d.missing > 0 && (
        <div className="arx-info is-warn">
          <p>
            <b>
              {d.missing} paid order{d.missing === 1 ? " has" : "s have"} no invoice yet
            </b>{" "}
            · paid before invoices were issued automatically. Open {d.missing === 1 ? "its" : "their"} invoice from the order to issue it.
          </p>
        </div>
      )}
      {d && (
        <p className="arx-kpis">
          <span>
            Invoices <b>{live.length}</b> · <b>{money(sum(live.map((o) => o.total)))}</b> with GST
          </span>
          <span>
            GST on them <b>{money(sum(live.map((o) => o.tax)))}</b> · {live.filter((o) => o.buyer_gstin).length} to businesses (B2B)
          </span>
          <span>
            Credit notes <b>{d.notes.length}</b> · <b>{money(sum(d.notes.map((n) => n.amount)))}</b> refunded
          </span>
        </p>
      )}
      <ArSection title={tab === "invoices" ? "Invoices" : "Credit notes"} n={d ? (tab === "invoices" ? d.invoices.length : d.notes.length) : undefined} />
      <div className="aro-grid" style={{ maxHeight: "none" }} onContextMenu={(e) => menu.open(e, rowMenu(false, null, undefined))}>
        {tab === "invoices" ? (
          <table className="adm-table aro-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Tax number</th>
                <th className="r">Tax</th>
                <th className="r">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(d?.invoices ?? []).map((o) => (
                <tr
                  key={o.id}
                  className={`${o.id === sel ? "is-sel" : ""} ${o.status === "cancelled" ? "is-back" : ""}`}
                  onClick={() => setSel(o.id)}
                  onDoubleClick={() => openOrder(o.id)}
                  onContextMenu={(e) => {
                    setSel(o.id);
                    e.stopPropagation();
                    menu.open(e, rowMenu(true, o.id, invoiceSrc([o.id])));
                  }}
                >
                  <td>{o.invoice_number}</td>
                  <td>{dmy(o.invoice_date ?? o.created_at)}</td>
                  <td>
                    <Link href={`/admin/orders/view?id=${o.id}`}>{o.order_number}</Link>
                  </td>
                  <td>{o.contact_name}</td>
                  <td>{o.buyer_gstin ?? ""}</td>
                  <td className="r">{money(o.tax)}</td>
                  <td className="r">{money(o.total)}</td>
                  <td>{o.status === "cancelled" ? "Cancelled" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="adm-table aro-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Against invoice</th>
                <th>Customer</th>
                <th className="r">Tax</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(d?.notes ?? []).map((n) => {
                const o = d?.noteOrders.get(n.order_id);
                return (
                  <tr
                    key={n.id}
                    className={n.id === sel ? "is-sel" : ""}
                    onClick={() => setSel(n.id)}
                    onDoubleClick={() => openOrder(n.order_id)}
                    onContextMenu={(e) => {
                      setSel(n.id);
                      e.stopPropagation();
                      menu.open(e, rowMenu(true, n.order_id, invoiceSrc([n.order_id], "cn")));
                    }}
                  >
                    <td>{n.number}</td>
                    <td>{dmy(n.issued_at)}</td>
                    <td>{o ? <Link href={`/admin/orders/view?id=${o.id}`}>{o.invoice_number}</Link> : "–"}</td>
                    <td>{o?.contact_name ?? ""}</td>
                    <td className="r">{money(n.tax)}</td>
                    <td className="r">{money(n.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!d && !err ? (
          <p className="aro-none">Loading.</p>
        ) : d && (tab === "invoices" ? !d.invoices.length : !d.notes.length) ? (
          <p className="aro-none">{tab === "invoices" ? "No invoices dated in this period." : "No credit notes dated in this period."}</p>
        ) : null}
        {menu.node}
      </div>
      <p className="arx-kpis">An invoice is issued when its order is paid; a credit note when an invoiced order is refunded. Neither can be changed once issued.</p>
    </div>
  );
}
