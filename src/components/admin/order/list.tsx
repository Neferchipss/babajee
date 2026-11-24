"use client";

import { useState } from "react";
import { toast } from "@/components/admin/Toaster";
import { isoDay } from "@/lib/dates";
import { download, itemsCsv, ordersCsv } from "@/lib/orders-csv";
import type { OrderStatus } from "@/lib/order-status";
import type { Order } from "@/lib/orders-db";

// What the order lists share (admin/orders, and the Aronium-style design's
// Documents screen): the kinds of work an order can wait on, the step that
// moves it on, an unpaid order's clock, and the export form.
export const openRequest = (o: Order) => (o.order_requests ?? []).find((r) => r.status === "open");
// Each tab: its title, what it's for in a line, and the one step that moves
// an order on from it (a button on every row; "ship" opens the order's
// courier form, since it needs a tracking number).
export type Step = { label: string; to: OrderStatus | "ship" | "open"; done: string };
export const TABS: { id: string; label: string; note: string; step?: Step; match: (o: Order) => boolean }[] = [
  { id: "all", label: "All orders", note: "Every order, newest first. Tap one to see it all and act on it.", match: () => true },
  { id: "pending", label: "Payment pending", note: "Not paid yet. Contact each customer to take payment, then mark it paid. Unpaid orders cancel themselves after the hours set in Settings.", step: { label: "Mark paid", to: "paid", done: "marked as paid" }, match: (o) => o.status === "pending" },
  { id: "paid", label: "To pack", note: "Paid and ready to pack. Pack them, then mark them packed.", step: { label: "Packed", to: "packed", done: "marked as packed" }, match: (o) => o.status === "paid" },
  { id: "packed", label: "Ready to dispatch", note: "Packed and waiting for the courier. Ship each with its courier and tracking number.", step: { label: "Ship…", to: "ship", done: "" }, match: (o) => o.status === "packed" },
  { id: "shipped", label: "On the way", note: "With the courier. Mark each delivered when it arrives.", step: { label: "Delivered", to: "delivered", done: "marked as delivered" }, match: (o) => o.status === "shipped" },
  { id: "requests", label: "Customer requests", note: "Customers asking to cancel or return. Open one to accept and refund, or decline with a reply.", step: { label: "Review", to: "open", done: "" }, match: (o) => !!openRequest(o) },
  { id: "problems", label: "Delivery problems", note: "Orders the courier couldn't deliver. Open one to send it again, or take it back in.", step: { label: "Sort it out", to: "open", done: "" }, match: (o) => o.status === "shipped" && !!o.delivery_failed_at },
  { id: "delivered", label: "Delivered", note: "Done. Customers can ask for a return from here, within the return window.", match: (o) => o.status === "delivered" && o.channel !== "counter" },
  { id: "closed", label: "Cancelled & refunded", note: "Orders that were cancelled or refunded in full.", match: (o) => o.status === "cancelled" || o.status === "refunded" },
  // walk-in sales rung up on the till (0085): paid and handed over on the spot
  { id: "counter", label: "Counter sales", note: "Sales rung up at the shop's counter on the Till: paid and handed over on the spot. Open one to print its receipt or refund it.", match: (o) => o.channel === "counter" },
];

// what a ticked group can be moved to, given the tab they are in (marking
// paid is one order at a time: each needs how it was paid, 0056)
export const BULK: Partial<Record<string, OrderStatus>> = { paid: "packed", shipped: "delivered" };

// an unpaid order's age and the time left before it cancels itself (0055)
const H = 3600 * 1000;
export function waiting(o: Order, hold: number) {
  const age = Date.now() - new Date(o.created_at).getTime();
  const ago = age < H ? `${Math.max(1, Math.round(age / 60000))} min ago` : age < 48 * H ? `${Math.round(age / H)} h ago` : `${Math.round(age / (24 * H))} days ago`;
  if (!hold) return { text: `Placed ${ago}`, urgent: false };
  const left = hold * H - age;
  const l = left <= 0 ? "due to cancel" : left < H ? `${Math.max(1, Math.round(left / 60000))} min left` : left < 48 * H ? `${Math.round(left / H)} h left` : `${Math.round(left / (24 * H))} days left`;
  return { text: `${ago} · ${l}`, urgent: left < 6 * H };
}
export const telOf = (phone: string) => phone.replace(/[^\d+]/g, "");
export const waOf = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
};

export function ExportForm({ shown, picked, tab, searching, onClose }: { shown: Order[]; picked: Order[]; tab: string; searching: boolean; onClose: () => void }) {
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
        toast(`Exported ${list.length} order${list.length === 1 ? "" : "s"}`);
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
