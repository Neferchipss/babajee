// Orders as a spreadsheet (CSV that Excel and Google Sheets open as-is):
// one row per order, or one row per item for packing or stock counts.
import { STATUS_LABEL } from "./order-status";
import type { Customer, Order } from "./orders-db";

const STAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
// "2026-11-04 13:05", India time
const stamp = (iso: string) => STAMP.format(new Date(iso)).replace(",", "");

const cell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const sheet = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
const r2 = (n: number) => Math.round(n * 100) / 100;

export function ordersCsv(orders: Order[]) {
  const head = [
    "Order", "Date", "Status", "Customer", "Phone", "Email",
    "Address", "Area", "Landmark", "City", "State", "Pincode",
    "Items", "Subtotal", "Delivery", "GST", "GST rate %", "GST in prices",
    "Total", "Paid", "Refunded", "Kept", "Test order", "Notes",
  ];
  const rows = orders.map((o) => {
    const refunded = r2((o.order_refunds ?? []).reduce((n, r) => n + r.amount, 0));
    const items = (o.order_items ?? []).reduce((n, i) => n + i.quantity, 0);
    return [
      o.order_number, stamp(o.created_at), STATUS_LABEL[o.status], o.contact_name, o.contact_phone, o.contact_email,
      o.address_line1, o.address_line2, o.address_landmark, o.address_city, o.address_state, o.address_pincode,
      items, o.subtotal, o.shipping, o.tax, o.gst_rate, o.gst_inclusive ? "Yes" : "No",
      o.total, o.paid_total ?? "", refunded || "", o.paid_total == null ? "" : r2(o.paid_total - refunded), o.is_test ? "Yes" : "", o.notes,
    ];
  });
  return sheet([head, ...rows]);
}

export function itemsCsv(orders: Order[]) {
  const head = ["Order", "Date", "Status", "Customer", "Phone", "City", "State", "Pincode", "Product", "Option", "SKU", "Unit price", "Quantity", "Line total"];
  const rows = orders.flatMap((o) =>
    (o.order_items ?? []).map((i) => [
      o.order_number, stamp(o.created_at), STATUS_LABEL[o.status], o.contact_name, o.contact_phone, o.address_city, o.address_state, o.address_pincode,
      i.product_name, i.variant_label, i.sku ?? "", i.unit_price, i.quantity, r2(i.unit_price * i.quantity),
    ]),
  );
  return sheet([head, ...rows]);
}

export function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// the customers in view, one row each
export function customersCsv(rows: Customer[]) {
  const head = ["Name", "Email", "Phone", "City", "State", "Tags", "Account", "Joined", "Orders", "Spent", "Last order"];
  return sheet([
    head,
    ...rows.map((c) => [
      c.full_name, c.email, c.phone, c.city, c.state, c.tags.join("; "),
      c.role === "admin" ? "Admin" : c.is_test ? "Test" : "Customer",
      stamp(c.joined), c.orders, r2(c.spent), c.last_order ? stamp(c.last_order) : "",
    ]),
  ]);
}
