import type { CreditNoteRow } from "../credit-note";
import { toNumber } from "../currency";
import { FULL, Order, db, toOrder } from "./core";

export type CheckoutLine = { slug: string; variant: string; qty: number };
export type CheckoutAddress = Record<
  "recipient_name" | "phone" | "line1" | "line2" | "landmark" | "city" | "state" | "pincode" | "latitude" | "longitude",
  string
>;
// The billing address on the customer's own pending order (0066); empty
// fields: the same as delivery.
export async function setOrderBilling(orderId: string, b: { name: string; line1: string; line2?: string; city: string; state: string; pincode: string }) {
  const { error } = await (await db()).rpc("set_order_billing", { p_order: orderId, p: b });
  if (error) throw error;
}
export async function placeOrder(lines: CheckoutLine[], address: CheckoutAddress, notes: string) {
  const { data, error } = await (await db()).rpc("place_order", { p_items: lines, p_address: address, p_notes: notes });
  if (error) throw error;
  const row = (data as { order_id: string; order_number: string }[])[0];
  // tie the order to the visit it came from (0048); analytics only, never blocks the order
  const { visitId } = await import("../track");
  const visit = visitId();
  if (row && visit) void (await db()).rpc("link_order_session", { p_order: row.order_id, p_session: visit }).then(() => {});
  return row;
}
// RLS keeps this to the signed-in customer's own orders (an admin would see
// every order, so it filters by profile too)
// the customer's list: each item's product slug for its photo, delivery and refund dates
export const MINE =
  "*, order_items(id, product_name, variant_label, unit_price, quantity, product_variants(label, products(slug))), shipments(delivered_at, shipped_at, carrier), order_refunds(id, amount, subtotal, shipping, tax, returned, created_at), order_requests(id, kind, status, reply)";
export async function listMyOrders(profileId: string): Promise<Order[]> {
  const { data, error } = await (await db()).from("orders").select(MINE).eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toOrder);
}
// several orders in full, for printing invoices; oldest first
export async function getOrders(ids: string[]): Promise<Order[]> {
  if (!ids.length) return [];
  const { data, error } = await (await db()).from("orders").select(FULL).in("id", ids).order("created_at");
  if (error) throw error;
  return (data ?? []).map(toOrder);
}
// the buyer's GSTIN on a B2B order; only before its invoice is issued (0051)
export async function setBuyerGstin(orderId: string, gstin: string) {
  const { error } = await (await db()).rpc("admin_set_buyer_gstin", { p_order: orderId, p_gstin: gstin });
  if (error) throw error;
}
// credit notes for every refund on these invoiced orders that has none yet,
// then all their notes (0051)
export async function issueCreditNotes(ids: string[]): Promise<CreditNoteRow[]> {
  const { error } = await (await db()).rpc("admin_issue_credit_notes", { p_orders: ids });
  if (error) throw error;
  const { data, error: e2 } = await (await db()).from("credit_notes").select("*").in("order_id", ids).order("issued_at");
  if (e2) throw e2;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, amount: toNumber(r.amount), tax: toNumber(r.tax), cess: toNumber(r.cess ?? 0), shipping: toNumber(r.shipping) }) as CreditNoteRow);
}
// IST day range [from, to] as timestamps, for invoice and credit-note dates
export const istRange = (from: string, to: string) => [new Date(`${from}T00:00:00+05:30`).toISOString(), new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000).toISOString()];
// orders whose invoice is dated in the range, in full, oldest first (paged past
// PostgREST's row cap)
export async function invoicedOrders(from: string, to: string): Promise<Order[]> {
  const [a, b] = istRange(from, to);
  const out: Order[] = [];
  for (let at = 0; ; at += 500) {
    const { data, error } = await (await db()).from("orders").select(FULL).not("invoice_number", "is", null).gte("invoice_date", a).lt("invoice_date", b).order("invoice_date").order("id").range(at, at + 499);
    if (error) throw error;
    out.push(...(data ?? []).map(toOrder));
    if ((data ?? []).length < 500) return out;
  }
}
// paid orders placed up to the end of the range that still have no invoice
// (paid before invoices were issued automatically)
export async function uninvoicedPaid(from: string, to: string): Promise<number> {
  const [, b] = istRange(from, to);
  const { count, error } = await (await db()).from("orders").select("id", { count: "exact", head: true }).is("invoice_number", null).not("paid_total", "is", null).neq("status", "cancelled").eq("is_test", false).lt("created_at", b);
  if (error) throw error;
  return count ?? 0;
}
// credit notes issued in the range (0051)
export async function creditNotesIn(from: string, to: string): Promise<CreditNoteRow[]> {
  const [a, b] = istRange(from, to);
  const { data, error } = await (await db()).from("credit_notes").select("*").gte("issued_at", a).lt("issued_at", b).order("issued_at");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, amount: toNumber(r.amount), tax: toNumber(r.tax), cess: toNumber(r.cess ?? 0), shipping: toNumber(r.shipping) }) as CreditNoteRow);
}
// invoice numbers for these orders (paid ones without one get the next in the series)
export async function issueInvoices(ids: string[]) {
  const { data, error } = await (await db()).rpc("admin_issue_invoices", { p_orders: ids });
  if (error) throw error;
  return (data ?? []) as { order_id: string; invoice_number: string | null; invoice_date: string | null }[];
}
export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await (await db()).from("orders").select(FULL).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toOrder(data) : null;
}

// ---------------------------------------------------------------- admin: orders
// The customer's cancel button: an unpaid order cancels at once ("cancelled");
// a paid one asks the shop ("requested").
export async function cancelMyOrder(id: string, reason: string): Promise<"cancelled" | "requested"> {
  const { data, error } = await (await db()).rpc("customer_cancel_order", { p_order: id, p_reason: reason });
  if (error) throw error;
  return data as "cancelled" | "requested";
}
export async function requestReturn(id: string, items: { item: string; qty: number }[], reason: string, reasonCode = "") {
  // with the picked reason (0068); without it on a database that hasn't got it yet
  let { error } = await (await db()).rpc("customer_request_return", { p_order: id, p_items: items, p_reason: reason, p_reason_code: reasonCode });
  if (error?.code === "PGRST202") ({ error } = await (await db()).rpc("customer_request_return", { p_order: id, p_items: items, p_reason: reason }));
  if (error) throw error;
}
export async function withdrawRequest(id: string) {
  const { error } = await (await db()).rpc("customer_withdraw_request", { p_request: id });
  if (error) throw error;
}
// the shop's answer; accept after the refund or cancellation is recorded
export async function resolveRequest(id: string, accept: boolean, reply: string) {
  const { error } = await (await db()).rpc("admin_resolve_request", { p_request: id, p_accept: accept, p_reply: reply });
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: new order
