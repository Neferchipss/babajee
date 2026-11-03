"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Dialog, money, StatusPill, when } from "@/components/admin/ui";
import { isoDay } from "@/lib/dates";
import { download, itemsCsv, ordersCsv } from "@/lib/orders-csv";
import type { OrderStatus } from "@/lib/order-status";
import { errText, listOrders, updateOrder, type Order } from "@/lib/orders-db";

// The order list: one tab per kind of work (unpaid, to pack, to ship, ...),
// a search box, bulk "mark as" for ticked orders, and export to a spreadsheet.
const TABS: { id: string; label: string; match: (s: OrderStatus) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "pending", label: "Unpaid", match: (s) => s === "pending" },
  { id: "paid", label: "To pack", match: (s) => s === "paid" },
  { id: "packed", label: "To ship", match: (s) => s === "packed" },
  { id: "shipped", label: "Shipped", match: (s) => s === "shipped" },
  { id: "delivered", label: "Delivered", match: (s) => s === "delivered" },
  { id: "closed", label: "Cancelled / refunded", match: (s) => s === "cancelled" || s === "refunded" },
];

// what a ticked group can be moved to, given the tab they are in
const BULK: Partial<Record<string, OrderStatus>> = { pending: "paid", paid: "packed", shipped: "delivered" };

export default function OrdersPage() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}

function Orders() {
  const params = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<Order[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(params.get("tab") ?? "all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = () =>
    listOrders()
      .then(setRows)
      .catch((e) => setErr(errText(e)));
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    if (tab === "all") u.delete("tab");
    else u.set("tab", tab);
    window.history.replaceState(null, "", `${window.location.pathname}${u.size ? `?${u}` : ""}`);
  }, [tab]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, rows?.filter((o) => t.match(o.status)).length ?? 0])), [rows]);
  const shown = useMemo(() => {
    const t = TABS.find((x) => x.id === tab) ?? TABS[0];
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (o) =>
        t.match(o.status) &&
        (!s || o.order_number.toLowerCase().includes(s) || o.contact_name.toLowerCase().includes(s) || o.contact_phone.replace(/\D/g, "").includes(s.replace(/\D/g, "") || "§") || o.contact_email.toLowerCase().includes(s)),
    );
  }, [rows, tab, q]);

  const bulkTo = BULK[tab];
  async function bulk() {
    if (!bulkTo) return;
    setBusy(true);
    setErr("");
    try {
      for (const id of picked) await updateOrder(id, bulkTo);
      setPicked(new Set());
      await load();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <h1 className="sr-only">Orders</h1>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-chips" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`adm-chip ${tab === t.id ? "is-on" : ""}`} onClick={() => (setTab(t.id), setPicked(new Set()))}>
            {t.label}
            {t.id !== "all" && counts[t.id] > 0 && <b>{counts[t.id]}</b>}
          </button>
        ))}
      </div>

      <div className="adm-toolbar">
        <input className="adm-input" type="search" placeholder="Search by order number, name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        {bulkTo && picked.size > 0 && (
          <button type="button" className="adm-btn pri" disabled={busy} onClick={bulk}>
            {busy ? "Saving" : `Mark ${picked.size} as ${bulkTo}`}
          </button>
        )}
        <button type="button" className="adm-btn" disabled={!shown.length} onClick={() => setExporting(true)}>
          Export
        </button>
      </div>

      <Dialog open={exporting} onClose={() => setExporting(false)}>
        {exporting && (
          <ExportForm
            shown={shown}
            picked={shown.filter((o) => picked.has(o.id))}
            tab={TABS.find((t) => t.id === tab)?.label ?? "All"}
            searching={!!q.trim()}
            onClose={() => setExporting(false)}
          />
        )}
      </Dialog>

      <div className="adm-card adm-tablecard">
        {rows && shown.length === 0 ? (
          <p className="adm-empty">{rows.length === 0 ? "No orders yet. They appear here the moment a customer checks out." : "No orders match."}</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                {bulkTo && <th aria-label="Select" />}
                <th>Order</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Items</th>
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const items = o.order_items?.reduce((n, i) => n + i.quantity, 0) ?? 0;
                const href = `/admin/orders/view?id=${o.id}`;
                return (
                  <tr key={o.id} data-href onClick={(e) => !(e.target as HTMLElement).closest("input,a") && router.push(href)}>
                    {bulkTo && (
                      <td data-hide-sm>
                        <input type="checkbox" aria-label={`Select ${o.order_number}`} checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
                      </td>
                    )}
                    <td>
                      <Link href={href} className="row-link">
                        {o.order_number}
                      </Link>
                      {o.is_test && <span className="adm-muted adm-small"> · test</span>}
                    </td>
                    <td className="adm-muted">{when(o.created_at)}</td>
                    <td>
                      {o.contact_name}
                      <div className="adm-muted adm-small">{o.address_city}</div>
                    </td>
                    <td>
                      <StatusPill status={o.status} />
                      {o.status !== "refunded" && (o.order_refunds?.length ?? 0) > 0 && <div className="adm-small adm-refunded">Partly refunded</div>}
                    </td>
                    <td className="adm-muted" data-hide-sm>
                      {items} item{items === 1 ? "" : "s"}
                    </td>
                    <td className="r">
                      <strong>{money(o.total)}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ExportForm({ shown, picked, tab, searching, onClose }: { shown: Order[]; picked: Order[]; tab: string; searching: boolean; onClose: () => void }) {
  const [which, setWhich] = useState<"shown" | "picked">(picked.length ? "picked" : "shown");
  const [rows, setRows] = useState<"orders" | "items">("orders");
  const list = which === "picked" ? picked : shown;
  const items = list.reduce((n, o) => n + (o.order_items?.length ?? 0), 0);
  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        download(`babajee-${rows === "items" ? "order-items" : "orders"}-${isoDay(0)}.csv`, rows === "items" ? itemsCsv(list) : ordersCsv(list));
        onClose();
      }}
    >
      <h2>Export orders</h2>
      <fieldset className="adm-fieldset">
        <legend>Which orders</legend>
        <label className="adm-check">
          <input type="radio" name="which" checked={which === "shown"} onChange={() => setWhich("shown")} />
          {tab === "All" && !searching ? "All" : "The"} {shown.length} order{shown.length === 1 ? "" : "s"} {tab === "All" ? "" : `in ${tab}`}
          {searching ? " matching the search" : ""}
        </label>
        {picked.length > 0 && (
          <label className="adm-check">
            <input type="radio" name="which" checked={which === "picked"} onChange={() => setWhich("picked")} />
            The {picked.length} ticked
          </label>
        )}
      </fieldset>
      <fieldset className="adm-fieldset">
        <legend>Rows</legend>
        <label className="adm-check">
          <input type="radio" name="rows" checked={rows === "orders"} onChange={() => setRows("orders")} />
          One row per order: customer, address, money, refunds
        </label>
        <label className="adm-check">
          <input type="radio" name="rows" checked={rows === "items"} onChange={() => setRows("items")} />
          One row per item ({items}): for packing or counting stock
        </label>
      </fieldset>
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        A CSV file that opens in Excel or Google Sheets. Dates are India time.
      </p>
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onClose}>
          Back
        </button>
        <button className="adm-btn pri">Download</button>
      </div>
    </form>
  );
}
