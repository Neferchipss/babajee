// Orders, customers, stock and stats, read and written with the signed-in
// browser session. The database decides what each person may do: customers
// see only their own orders, and every admin call below is refused for
// anyone but role = 'admin' (supabase/migrations/0013_orders_admin.sql).
import { toNumber } from "./currency";
import type { OrderStatus } from "./order-status";
import { getSupabase } from "./supabase";

function db() {
  const sb = getSupabase();
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
  gst_rate: number;
  gst_inclusive: boolean;
  // what was actually paid; null until the order leaves "pending" (0017)
  paid_total: number | null;
  notes: string;
  is_test: boolean;
  created_at: string;
  order_items?: OrderItem[];
  order_events?: OrderEvent[];
  shipments?: Shipment[];
  order_refunds?: Refund[];
};

function toOrder(row: Record<string, unknown>): Order {
  const o = row as unknown as Order;
  return {
    ...o,
    subtotal: toNumber(o.subtotal),
    shipping: toNumber(o.shipping),
    tax: toNumber(o.tax),
    gst_rate: toNumber(o.gst_rate),
    total: toNumber(o.total),
    order_items: o.order_items?.map((i) => ({ ...i, unit_price: toNumber(i.unit_price) })),
    order_events: o.order_events?.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    paid_total: o.paid_total == null ? null : toNumber(o.paid_total),
    order_refunds: o.order_refunds
      ?.map((r) => ({ ...r, amount: toNumber(r.amount), subtotal: toNumber(r.subtotal), shipping: toNumber(r.shipping), tax: toNumber(r.tax) }))
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")),
  };
}

// the list carries enough for the spreadsheet export (items, address, refunds)
const LIST = "*, order_items(product_name, variant_label, sku, unit_price, quantity), order_refunds(amount, subtotal, shipping, tax)";
const FULL = "*, order_items(*), order_events(*), shipments(*), order_refunds(*, order_refund_items(*))";

// ---------------------------------------------------------------- customer

export type CheckoutLine = { slug: string; variant: string; qty: number };
export type CheckoutAddress = Record<
  "recipient_name" | "phone" | "line1" | "line2" | "landmark" | "city" | "state" | "pincode" | "latitude" | "longitude",
  string
>;

export async function placeOrder(lines: CheckoutLine[], address: CheckoutAddress, notes: string) {
  const { data, error } = await db().rpc("place_order", { p_items: lines, p_address: address, p_notes: notes });
  if (error) throw error;
  const row = (data as { order_id: string; order_number: string }[])[0];
  return row;
}

// RLS keeps this to the signed-in customer's own orders (an admin would see
// every order, so it filters by profile too)
export async function listMyOrders(profileId: string): Promise<Order[]> {
  const { data, error } = await db().from("orders").select(LIST).eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toOrder);
}

export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await db().from("orders").select(FULL).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toOrder(data) : null;
}

// ---------------------------------------------------------------- admin: orders

export async function listOrders(): Promise<Order[]> {
  const { data, error } = await db().from("orders").select(LIST).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map(toOrder);
}

export async function updateOrder(id: string, to: OrderStatus, opts: { note?: string; carrier?: string; tracking?: string; restock?: boolean } = {}) {
  const { error } = await db().rpc("admin_update_order", {
    p_order: id,
    p_status: to,
    p_note: opts.note ?? "",
    p_carrier: opts.carrier ?? null,
    p_tracking: opts.tracking ?? null,
    p_restock: opts.restock ?? false,
  });
  if (error) throw error;
}

// A refund, whole or partial; with items it's a return (0017). Money is
// recorded, not sent: the shop pays it back itself.
export async function refundOrder(
  id: string,
  r: { lines: { item: string; qty: number }[]; shipping: number; amount: number; restock: boolean; returned: boolean; reason: string },
) {
  const { error } = await db().rpc("admin_refund", {
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
  const { error } = await db().rpc("admin_edit_order", { p_order: id, p_lines: e.lines, p_shipping: e.shipping, p_contact: e.contact, p_address: e.address });
  if (error) throw error;
}

// The difference an edit made to a paid order was collected or paid back.
export async function settleBalance(id: string) {
  const { error } = await db().rpc("admin_settle_balance", { p_order: id });
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
  const { error } = await db().from("order_events").insert({ order_id: orderId, status: "comment", note, actor_id: actorId });
  if (error) throw error;
}

export async function setOrderNotes(id: string, notes: string) {
  const { error } = await db().from("orders").update({ notes }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: home + analytics

export type HomeCounts = Record<"unpaid" | "to_pack" | "to_ship" | "in_transit" | "out_of_stock" | "low_stock" | "unpriced", number>;

export async function homeCounts(): Promise<HomeCounts> {
  const { data, error } = await db().rpc("admin_home_counts");
  if (error) throw error;
  return data as HomeCounts;
}

export type Named = { name: string; [k: string]: string | number };
export type Analytics = {
  orders: number;
  items: number;
  gross: number;
  returns: number;
  shipping: number;
  tax: number;
  fulfilled: number;
  customers: number;
  returning: number;
  cancelled: number;
  daily: { day: string; gross: number; orders: number }[];
  top_products: { name: string; qty: number; sales: number }[];
  by_state: { name: string; orders: number; sales: number }[];
  sessions: number;
  views: number;
  cart_sessions: number;
  checkout_sessions: number;
  daily_sessions: { day: string; sessions: number }[];
  devices: { name: string; sessions: number }[];
  referrers: { name: string; sessions: number }[];
  pages: { name: string; views: number }[];
};

// numeric columns arrive as strings inside the JSON too
function numbers<T>(x: T): T {
  if (Array.isArray(x)) return x.map(numbers) as T;
  if (x && typeof x === "object") {
    return Object.fromEntries(
      Object.entries(x).map(([k, v]) => [k, k === "name" || k === "day" ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : numbers(v)]),
    ) as T;
  }
  return x;
}

export async function analytics(from: string, to: string): Promise<Analytics> {
  const { data, error } = await db().rpc("admin_analytics", { p_from: from, p_to: to });
  if (error) throw error;
  return numbers(data as Analytics);
}

// ---------------------------------------------------------------- admin: customers

export type Customer = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  role: "customer" | "admin";
  joined: string;
  orders: number;
  spent: number;
  last_order: string | null;
};

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await db().rpc("admin_customers");
  if (error) throw error;
  return ((data ?? []) as Customer[]).map((c) => ({ ...c, orders: toNumber(c.orders), spent: toNumber(c.spent) }));
}

export type CustomerNote = { id: string; body: string; author_id: string | null; created_at: string };
export type CustomerAddress = {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
};

export async function customerDetail(id: string) {
  const sb = db();
  const [orders, addresses, notes] = await Promise.all([
    sb.from("orders").select(LIST).eq("profile_id", id).order("created_at", { ascending: false }),
    sb.from("addresses").select("id, label, recipient_name, phone, line1, line2, landmark, city, state, pincode, latitude, longitude, is_default").eq("profile_id", id).order("is_default", { ascending: false }),
    sb.from("customer_notes").select("id, body, author_id, created_at").eq("profile_id", id).order("created_at", { ascending: false }),
  ]);
  for (const r of [orders, addresses, notes]) if (r.error) throw r.error;
  return {
    orders: (orders.data ?? []).map(toOrder),
    addresses: (addresses.data ?? []) as CustomerAddress[],
    notes: (notes.data ?? []) as CustomerNote[],
  };
}

export async function addCustomerNote(profileId: string, authorId: string, body: string) {
  const { error } = await db().from("customer_notes").insert({ profile_id: profileId, author_id: authorId, body });
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: stock history

export type StockMove = {
  id: string;
  variant_id: string;
  delta: number;
  qty_after: number;
  reason: "sale" | "cancel" | "refund" | "return" | "edit" | "manual";
  order_id: string | null;
  created_at: string;
  product_name: string;
  label: string;
  order_number: string | null;
};

export async function stockHistory(variantIds?: string[]): Promise<StockMove[]> {
  let q = db()
    .from("stock_movements")
    .select("id, variant_id, delta, qty_after, reason, order_id, created_at, product_variants(label, products(name)), orders(order_number)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (variantIds) q = q.in("variant_id", variantIds);
  const { data, error } = await q;
  if (error) throw error;
  type Row = Omit<StockMove, "product_name" | "label" | "order_number"> & {
    product_variants: { label: string; products: { name: string } | null } | null;
    orders: { order_number: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map(({ product_variants, orders, ...m }) => ({
    ...m,
    product_name: product_variants?.products?.name ?? "Removed product",
    label: product_variants?.label ?? "",
    order_number: orders?.order_number ?? null,
  }));
}

// ---------------------------------------------------------------- admin: settings

export type StoreSettings = {
  shipping: number;
  free_shipping_over: number | null;
  gst_rate: number;
  gst_inclusive: boolean;
  gst_input_credit: boolean;
  store_state: string;
};

// Readable by anyone: the checkout needs the delivery charge and GST rule.
export async function getSettings(): Promise<StoreSettings> {
  const { data, error } = await db().from("store_settings").select("shipping, free_shipping_over, gst_rate, gst_inclusive, gst_input_credit, store_state").eq("id", 1).single();
  if (error) throw error;
  return {
    shipping: toNumber(data.shipping),
    free_shipping_over: data.free_shipping_over == null ? null : toNumber(data.free_shipping_over),
    gst_rate: toNumber(data.gst_rate),
    gst_inclusive: data.gst_inclusive,
    gst_input_credit: data.gst_input_credit,
    store_state: data.store_state ?? "",
  };
}

export async function saveSettings(s: StoreSettings) {
  const { error } = await db().from("store_settings").update(s).eq("id", 1);
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: cost + profit

// Cost prices, by option id. Admin-only table (0015), never shown to customers.
export async function getCosts(variantIds: string[]): Promise<Map<string, number>> {
  if (!variantIds.length) return new Map();
  const { data, error } = await db().from("variant_costs").select("variant_id, cost").in("variant_id", variantIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.variant_id as string, toNumber(r.cost)]));
}

// null clears it (no cost known)
export async function setCost(variantId: string, cost: number | null) {
  const q = db().from("variant_costs");
  const { error } = cost == null ? await q.delete().eq("variant_id", variantId) : await q.upsert({ variant_id: variantId, cost });
  if (error) throw error;
}

// The cost each line of an order sold at, by order line id.
export async function soldCosts(itemIds: string[]): Promise<Map<string, number>> {
  if (!itemIds.length) return new Map();
  const { data, error } = await db().from("order_item_costs").select("order_item_id, unit_cost").in("order_item_id", itemIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.order_item_id as string, toNumber(r.unit_cost)]));
}

export type Profit = {
  input_credit: boolean;
  net_sales: number;
  costed_sales: number;
  cost: number;
  profit: number;
  lines: number;
  uncosted_lines: number;
  gst_collected: number;
  gst_on_top: number;
  gst_paid: number;
  daily: { day: string; profit: number }[];
  top: { name: string; qty: number; sales: number; profit: number }[];
};

export async function profit(from: string, to: string): Promise<Profit> {
  const { data, error } = await db().rpc("admin_profit", { p_from: from, p_to: to });
  if (error) throw error;
  const p = data as Profit;
  const n = (x: unknown) => toNumber(x as number);
  return {
    ...p,
    net_sales: n(p.net_sales),
    costed_sales: n(p.costed_sales),
    cost: n(p.cost),
    profit: n(p.profit),
    gst_collected: n(p.gst_collected),
    gst_on_top: n(p.gst_on_top),
    gst_paid: n(p.gst_paid),
    daily: p.daily.map((d) => ({ day: d.day, profit: n(d.profit) })),
    top: p.top.map((t) => ({ ...t, qty: n(t.qty), sales: n(t.sales), profit: n(t.profit) })),
  };
}

// ---------------------------------------------------------------- admin: reports

export type ReportKind = "products" | "customers" | "stock" | "finance" | "gst";
export type ReportRow = Record<string, string | number | boolean | null>;

// One report's rows for a date range (0016). Columns per kind are listed on
// the Reports page.
export async function report(kind: ReportKind, from: string, to: string): Promise<ReportRow[]> {
  const { data, error } = await db().rpc("admin_report", { p_kind: kind, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as ReportRow[];
}
