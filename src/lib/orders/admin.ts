import { toNumber } from "../currency";
import type { OrderStatus } from "../order-status";
import { LIST, Order, db, toOrder } from "./core";
import { CustomerAddress, SupportChannel } from "./customers";

export async function listOrders(): Promise<Order[]> {
  const { data, error } = await (await db()).from("orders").select(LIST).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map(toOrder);
}
export async function updateOrder(id: string, to: OrderStatus, opts: { note?: string; carrier?: string; tracking?: string; restock?: boolean } = {}) {
  const { error } = await (await db()).rpc("admin_update_order", {
    p_order: id,
    p_status: to,
    p_note: opts.note ?? "",
    p_carrier: opts.carrier ?? null,
    p_tracking: opts.tracking ?? null,
    p_restock: opts.restock ?? false,
  });
  if (error) throw error;
}
// Move an order to any step of the road, forward or back (0021). Going
// back undoes what the later steps recorded (courier, delivery date, payment).
export async function setStep(id: string, to: OrderStatus, opts: { note?: string; carrier?: string; tracking?: string } = {}) {
  const { error } = await (await db()).rpc("admin_set_step", {
    p_order: id,
    p_status: to,
    p_note: opts.note ?? "",
    p_carrier: opts.carrier ?? null,
    p_tracking: opts.tracking ?? null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- manual payments (0056)
// "Mark paid": how the money came in. The database records the payment and
// moves the order to paid (invoice, confirmation email) in one go.
export async function markPaid(id: string, p: { method: string; reference?: string; received?: string | null; note?: string }) {
  const { error } = await (await db()).rpc("admin_mark_paid", {
    p_order: id,
    p_method: p.method,
    p_reference: p.reference ?? "",
    p_received: p.received || null,
    p_note: p.note ?? "",
  });
  if (error) throw error;
}
export type Payment = { id: string; order_id: string; method: string; reference: string; amount: number; status: string; received_on: string | null; created_at: string; note: string };
export async function paymentsFor(orderIds: string[]): Promise<Payment[]> {
  if (!orderIds.length) return [];
  const { data, error } = await (await db())
    .from("payments")
    .select("id, order_id, method, reference, amount, status, received_on, created_at, note")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...(r as Payment), amount: toNumber(r.amount), method: (r.method as string) ?? "", reference: (r.reference as string) ?? "", note: (r.note as string) ?? "" }));
}
// the contacts logged against unpaid orders, newest first, by order id
export type OrderContact = { id: string; order_id: string; body: string; channel: SupportChannel; created_at: string; status: "open" | "resolved" | null };
export async function contactsFor(orderIds: string[]): Promise<Map<string, OrderContact[]>> {
  const out = new Map<string, OrderContact[]>();
  if (!orderIds.length) return out;
  const { data, error } = await (await db())
    .from("customer_notes")
    .select("id, order_id, body, channel, created_at, status")
    .in("order_id", orderIds)
    .eq("kind", "contact")
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const r of (data ?? []) as OrderContact[]) out.set(r.order_id, [...(out.get(r.order_id) ?? []), r]);
  return out;
}
// Failed deliveries (0039): the courier couldn't deliver a shipped order;
// then it's sent again, or it came back and is closed after its refund.
export async function deliveryFailed(id: string, reason: string, note = "") {
  const { error } = await (await db()).rpc("admin_delivery_failed", { p_order: id, p_reason: reason, p_note: note });
  if (error) throw error;
}
export async function sendAgain(id: string, opts: { carrier?: string; tracking?: string; note?: string } = {}) {
  const { error } = await (await db()).rpc("admin_send_again", { p_order: id, p_carrier: opts.carrier ?? null, p_tracking: opts.tracking ?? null, p_note: opts.note ?? "" });
  if (error) throw error;
}
export async function cameBack(id: string, note = "") {
  const { error } = await (await db()).rpc("admin_came_back", { p_order: id, p_note: note });
  if (error) throw error;
}
export async function failedDeliveries(from: string, to: string): Promise<number> {
  const { data, error } = await (await db()).rpc("admin_failed_deliveries", { p_from: from, p_to: to });
  if (error) throw error;
  return Number(data ?? 0);
}
// A refund, whole or partial; with items it's a return (0017). Money is
// recorded, not sent: the shop pays it back itself.
export async function refundOrder(
  id: string,
  r: { lines: { item: string; qty: number }[]; shipping: number; amount: number; restock: boolean; returned: boolean; reason: string },
) {
  const { error } = await (await db()).rpc("admin_refund", {
    p_order: id,
    p_lines: r.lines,
    p_shipping: r.shipping,
    p_amount: r.amount,
    p_restock: r.restock,
    p_returned: r.returned,
    p_reason: r.reason,
  });
  if (error) throw error;
}
export type EditLine = { item: string; qty: number } | { variant: string; qty: number };
export type EditContact = { name: string; phone: string; email: string };
export type EditAddress = { line1: string; line2: string; landmark: string; city: string; state: string; pincode: string };
// Change an order before it ships: quantities, items, delivery, contact, address.
export async function editOrder(id: string, e: { lines: EditLine[]; shipping: number | null; contact: EditContact | null; address: EditAddress | null }) {
  const { error } = await (await db()).rpc("admin_edit_order", { p_order: id, p_lines: e.lines, p_shipping: e.shipping, p_contact: e.contact, p_address: e.address });
  if (error) throw error;
}
// Take back a refund recorded by mistake (0019): restocked items come off
// the shelf again and a fully refunded order reopens where it was.
export async function undoRefund(refundId: string) {
  const { error } = await (await db()).rpc("admin_undo_refund", { p_refund: refundId });
  if (error) throw error;
}
// The difference an edit made to a paid order was collected or paid back.
export async function settleBalance(id: string) {
  const { error } = await (await db()).rpc("admin_settle_balance", { p_order: id });
  if (error) throw error;
}
// refunded so far, and per order line how many were refunded
export function refundsOf(o: Order) {
  const rs = o.order_refunds ?? [];
  const byItem = new Map<string, number>();
  for (const r of rs) for (const i of r.order_refund_items ?? []) byItem.set(i.order_item_id, (byItem.get(i.order_item_id) ?? 0) + i.quantity);
  return {
    amount: rs.reduce((n, r) => n + r.amount, 0),
    shipping: rs.reduce((n, r) => n + r.shipping, 0),
    byItem,
  };
}
export async function addOrderComment(orderId: string, actorId: string, note: string) {
  const { error } = await (await db()).from("order_events").insert({ order_id: orderId, status: "comment", note, actor_id: actorId });
  if (error) throw error;
}
export async function setOrderNotes(id: string, notes: string) {
  const { error } = await (await db()).from("orders").update({ notes }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: home + analytics
export type NewOrder = {
  customer: string | null;
  contact: { name: string; phone: string; email: string };
  address: { line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; latitude: number | null; longitude: number | null };
  lines: { variant: string; qty: number; price?: number }[];
  shipping: number | null;
  notes: string;
  paid: boolean;
  // a business buyer's GSTIN (0051), '' for a consumer
  gstin?: string;
};
// An order taken by the shop (phone, WhatsApp, counter); see 0018.
export async function createOrder(n: NewOrder): Promise<{ id: string; number: string }> {
  const args = { p_customer: n.customer, p_contact: n.contact, p_address: n.address, p_lines: n.lines, p_shipping: n.shipping, p_notes: n.notes, p_paid: n.paid };
  const { data, error } = n.gstin ? await (await db()).rpc("admin_create_order_b2b", { ...args, p_gstin: n.gstin }) : await (await db()).rpc("admin_create_order", args);
  if (error) throw error;
  const row = (data as { order_id: string; order_number: string }[])[0];
  return { id: row.order_id, number: row.order_number };
}
export async function customerAddresses(id: string): Promise<CustomerAddress[]> {
  const { data, error } = await (await db())
    .from("addresses")
    .select("id, label, recipient_name, phone, line1, line2, landmark, city, state, pincode, latitude, longitude, is_default")
    .eq("profile_id", id)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerAddress[];
}

// ---------------------------------------------------------------- delivery reports
