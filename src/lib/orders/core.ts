import { toNumber } from "../currency";
import type { OrderStatus } from "../order-status";
import { loadSupabase } from "../sb";

export async function db() {
  const sb = await loadSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb;
}
// Postgres errors raised by our functions carry a sentence meant for people;
// anything else gets a plain fallback.
export function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message;
  return "Something went wrong. Try again.";
}
export type OrderItem = {
  id: string;
  variant_id: string | null;
  product_name: string;
  variant_label: string;
  sku: string | null;
  unit_price: number;
  quantity: number;
  // the GST bracket this line sold at, and the product's HSN code today (0030)
  gst_rate?: number;
  // the HSN it was sold under (0051 copies it onto the line); before that, the product's
  hsn?: string;
  // the cess rate it sold at and the cess on the line (0060; 0 = none)
  cess_rate?: number;
  cess?: number;
  // pieces in one of this line's option (a box of 50: 50), from the option today; 1 for loose
  pack?: number;
  // the product's slug, for its photo (customer list only; null if it was removed or hidden)
  slug?: string | null;
  // the product as it is in the shop today, for "Buy again" (customer order page)
  live?: { slug: string; category: string; label: string; price: number; ok: boolean } | null;
};
export type OrderRequest = {
  id: string;
  kind: "cancel" | "return";
  status: "open" | "accepted" | "declined" | "withdrawn";
  reason: string;
  items: { item: string; qty: number }[];
  reply: string;
  created_at: string;
  resolved_at: string | null;
};
export type OrderEvent = { id: string; status: string; note: string; actor_id: string | null; created_at: string };
export type Shipment = { id: string; carrier: string | null; tracking_number: string | null; shipped_at: string | null; delivered_at: string | null };
export type RefundItem = { refund_id: string; order_item_id: string; quantity: number };
export type Refund = {
  id: string;
  amount: number;
  subtotal: number;
  shipping: number;
  tax: number;
  // the cess in it (0060)
  cess?: number;
  restocked: boolean;
  returned: boolean;
  reason: string;
  created_at: string;
  order_refund_items?: RefundItem[];
};
export type Order = {
  id: string;
  order_number: string;
  profile_id: string | null;
  status: OrderStatus;
  // an open failed delivery (0039): when and why; cleared when sent again
  delivery_failed_at?: string | null;
  delivery_failed_reason?: string;
  delivery_attempts?: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address_line1: string;
  address_line2: string;
  address_landmark: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
  address_latitude: number | null;
  address_longitude: number | null;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  // the one GST rate all lines share; null when lines sit in different brackets (0030)
  gst_rate: number | null;
  // cess on top of GST (0060), 0 unless switched on and set on its products
  cess?: number;
  gst_inclusive: boolean;
  // what was actually paid; null until the order leaves "pending" (0017)
  paid_total: number | null;
  notes: string;
  is_test: boolean;
  // its GST invoice, once one has been made (0029)
  invoice_number?: string | null;
  invoice_date?: string | null;
  // the buyer's GSTIN for a B2B sale, '' for a consumer (0051)
  buyer_gstin?: string;
  // where the bill goes, when not the delivery address (0066)
  billing_name?: string;
  billing_line1?: string;
  billing_line2?: string;
  billing_city?: string;
  billing_state?: string;
  billing_pincode?: string;
  created_at: string;
  updated_at?: string;
  order_items?: OrderItem[];
  order_events?: OrderEvent[];
  shipments?: Shipment[];
  order_refunds?: Refund[];
  order_requests?: OrderRequest[];
};
export function toOrder(row: Record<string, unknown>): Order {
  const o = row as unknown as Order;
  return {
    ...o,
    subtotal: toNumber(o.subtotal),
    shipping: toNumber(o.shipping),
    tax: toNumber(o.tax),
    cess: toNumber(o.cess ?? 0),
    gst_rate: o.gst_rate == null ? null : toNumber(o.gst_rate),
    total: toNumber(o.total),
    order_items: o.order_items?.map((i) => {
      type PV = {
        label?: string;
        price?: number | string;
        is_visible?: boolean;
        pack_of?: number;
        products?: { slug?: string; is_visible?: boolean; hsn?: string; categories?: { slug?: string } | null } | null;
      } | null;
      const raw = i as OrderItem & { product_variants?: PV };
      const { product_variants: pv, ...rest } = raw;
      const p = pv?.products;
      const live =
        pv && p?.slug && pv.label !== undefined && pv.price !== undefined
          ? { slug: p.slug, category: p.categories?.slug ?? "", label: pv.label, price: toNumber(pv.price), ok: !!(pv.is_visible && p.is_visible && toNumber(pv.price) > 0) }
          : null;
      return { ...rest, unit_price: toNumber(i.unit_price), cess_rate: toNumber(i.cess_rate ?? 0), cess: toNumber(i.cess ?? 0), ...(i.gst_rate != null ? { gst_rate: toNumber(i.gst_rate) } : {}), hsn: (i.hsn as string | undefined) || (o.invoice_number ? "" : (p?.hsn ?? "")), ...(pv !== undefined ? { slug: p?.slug ?? null, live } : {}), ...(pv?.pack_of && pv.pack_of > 1 ? { pack: pv.pack_of } : {}) };
    }),
    order_events: o.order_events?.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    paid_total: o.paid_total == null ? null : toNumber(o.paid_total),
    order_refunds: o.order_refunds
      ?.map((r) => ({ ...r, amount: toNumber(r.amount), subtotal: toNumber(r.subtotal), shipping: toNumber(r.shipping), tax: toNumber(r.tax), cess: toNumber(r.cess ?? 0) }))
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")),
  };
}
// the list carries enough for the spreadsheet export (items, address, refunds)
export const LIST = "*, order_items(product_name, variant_label, sku, unit_price, quantity), order_refunds(amount, subtotal, shipping, tax), order_requests(id, kind, status, reason)";
export const FULL =
  "*, order_items(*, product_variants(label, price, is_visible, pack_of, products(slug, is_visible, hsn, categories(slug)))), order_events(*), shipments(*), order_refunds(*, order_refund_items(*)), order_requests(*)";

// ---------------------------------------------------------------- customer
