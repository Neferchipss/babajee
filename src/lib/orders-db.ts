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
  // the GST bracket this line sold at, and the product's HSN code today (0030)
  gst_rate?: number;
  hsn?: string;
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
  gst_inclusive: boolean;
  // what was actually paid; null until the order leaves "pending" (0017)
  paid_total: number | null;
  notes: string;
  is_test: boolean;
  // its GST invoice, once one has been made (0029)
  invoice_number?: string | null;
  invoice_date?: string | null;
  created_at: string;
  updated_at?: string;
  order_items?: OrderItem[];
  order_events?: OrderEvent[];
  shipments?: Shipment[];
  order_refunds?: Refund[];
  order_requests?: OrderRequest[];
};

function toOrder(row: Record<string, unknown>): Order {
  const o = row as unknown as Order;
  return {
    ...o,
    subtotal: toNumber(o.subtotal),
    shipping: toNumber(o.shipping),
    tax: toNumber(o.tax),
    gst_rate: o.gst_rate == null ? null : toNumber(o.gst_rate),
    total: toNumber(o.total),
    order_items: o.order_items?.map((i) => {
      type PV = {
        label?: string;
        price?: number | string;
        is_visible?: boolean;
        products?: { slug?: string; is_visible?: boolean; hsn?: string; categories?: { slug?: string } | null } | null;
      } | null;
      const raw = i as OrderItem & { product_variants?: PV };
      const { product_variants: pv, ...rest } = raw;
      const p = pv?.products;
      const live =
        pv && p?.slug && pv.label !== undefined && pv.price !== undefined
          ? { slug: p.slug, category: p.categories?.slug ?? "", label: pv.label, price: toNumber(pv.price), ok: !!(pv.is_visible && p.is_visible && toNumber(pv.price) > 0) }
          : null;
      return { ...rest, unit_price: toNumber(i.unit_price), ...(i.gst_rate != null ? { gst_rate: toNumber(i.gst_rate) } : {}), ...(p?.hsn ? { hsn: p.hsn } : {}), ...(pv !== undefined ? { slug: p?.slug ?? null, live } : {}) };
    }),
    order_events: o.order_events?.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    paid_total: o.paid_total == null ? null : toNumber(o.paid_total),
    order_refunds: o.order_refunds
      ?.map((r) => ({ ...r, amount: toNumber(r.amount), subtotal: toNumber(r.subtotal), shipping: toNumber(r.shipping), tax: toNumber(r.tax) }))
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")),
  };
}

// the list carries enough for the spreadsheet export (items, address, refunds)
const LIST = "*, order_items(product_name, variant_label, sku, unit_price, quantity), order_refunds(amount, subtotal, shipping, tax), order_requests(id, kind, status, reason)";
const FULL =
  "*, order_items(*, product_variants(label, price, is_visible, products(slug, is_visible, hsn, categories(slug)))), order_events(*), shipments(*), order_refunds(*, order_refund_items(*)), order_requests(*)";

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
// the customer's list: each item's product slug for its photo, delivery and refund dates
const MINE =
  "*, order_items(id, product_name, variant_label, unit_price, quantity, product_variants(label, products(slug))), shipments(delivered_at, shipped_at, carrier), order_refunds(id, amount, subtotal, shipping, tax, returned, created_at), order_requests(id, kind, status, reply)";

export async function listMyOrders(profileId: string): Promise<Order[]> {
  const { data, error } = await db().from("orders").select(MINE).eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toOrder);
}

// several orders in full, for printing invoices and packing slips; oldest first
export async function getOrders(ids: string[]): Promise<Order[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("orders").select(FULL).in("id", ids).order("created_at");
  if (error) throw error;
  return (data ?? []).map(toOrder);
}

// invoice numbers for these orders (paid ones without one get the next in the series)
export async function issueInvoices(ids: string[]) {
  const { data, error } = await db().rpc("admin_issue_invoices", { p_orders: ids });
  if (error) throw error;
  return (data ?? []) as { order_id: string; invoice_number: string | null; invoice_date: string | null }[];
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

// Move an order to any step of the road, forward or back (0021). Going
// back undoes what the later steps recorded (courier, delivery date, payment).
export async function setStep(id: string, to: OrderStatus, opts: { note?: string; carrier?: string; tracking?: string } = {}) {
  const { error } = await db().rpc("admin_set_step", {
    p_order: id,
    p_status: to,
    p_note: opts.note ?? "",
    p_carrier: opts.carrier ?? null,
    p_tracking: opts.tracking ?? null,
  });
  if (error) throw error;
}

// Failed deliveries (0039): the courier couldn't deliver a shipped order;
// then it's sent again, or it came back and is closed after its refund.
export const FAIL_REASONS = ["Customer not home", "Wrong or incomplete address", "Phone unreachable", "Refused the parcel", "Other"];
export async function deliveryFailed(id: string, reason: string, note = "") {
  const { error } = await db().rpc("admin_delivery_failed", { p_order: id, p_reason: reason, p_note: note });
  if (error) throw error;
}
export async function sendAgain(id: string, opts: { carrier?: string; tracking?: string; note?: string } = {}) {
  const { error } = await db().rpc("admin_send_again", { p_order: id, p_carrier: opts.carrier ?? null, p_tracking: opts.tracking ?? null, p_note: opts.note ?? "" });
  if (error) throw error;
}
export async function cameBack(id: string, note = "") {
  const { error } = await db().rpc("admin_came_back", { p_order: id, p_note: note });
  if (error) throw error;
}
export async function failedDeliveries(from: string, to: string): Promise<number> {
  const { data, error } = await db().rpc("admin_failed_deliveries", { p_from: from, p_to: to });
  if (error) throw error;
  return Number(data ?? 0);
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

// Take back a refund recorded by mistake (0019): restocked items come off
// the shelf again and a fully refunded order reopens where it was.
export async function undoRefund(refundId: string) {
  const { error } = await db().rpc("admin_undo_refund", { p_refund: refundId });
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

export type HomeCounts = Record<"requests" | "unpaid" | "to_pack" | "to_ship" | "in_transit" | "out_of_stock" | "low_stock" | "unpriced", number>;

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

// sales by category for a date range (migration 0035), biggest first
export type CategorySales = { name: string; slug: string; qty: number; sales: number };
export async function salesByCategory(from: string, to: string): Promise<CategorySales[]> {
  const { data, error } = await db().rpc("admin_sales_by_category", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as CategorySales[]).map((r) => ({ ...r, qty: Number(r.qty), sales: Number(r.sales) }));
}

export async function analytics(from: string, to: string): Promise<Analytics> {
  const { data, error } = await db().rpc("admin_analytics", { p_from: from, p_to: to });
  if (error) throw error;
  return numbers(data as Analytics);
}

// ---------------------------------------------------------------- admin: traffic

// Visits grouped into sessions. A bounce is a visit that saw one page and
// went no further; "cart" and "checkout" count visits that reached them.
export type TrafficGroup = { name: string; sessions: number; views: number; bounced: number; cart: number; checkout: number };
export type Traffic = {
  sessions: number;
  views: number;
  bounced: number;
  engaged_secs: number;
  cart_sessions: number;
  checkout_sessions: number;
  orders: number;
  first_visit: string | null;
  daily: { day: string; sessions: number; views: number }[];
  sources: TrafficGroup[];
  devices: TrafficGroup[];
  landing: { name: string; sessions: number; bounced: number; checkout: number }[];
  pages: { name: string; views: number; visitors: number }[];
  hours: { dow: number; hour: number; sessions: number }[];
  categories: { name: string; views: number; visitors: number; units: number; sales: number }[];
};

export async function traffic(from: string, to: string): Promise<Traffic> {
  const { data, error } = await db().rpc("admin_traffic", { p_from: from, p_to: to });
  if (error) throw error;
  const t = numbers(data as Traffic);
  // first_visit is a timestamp, not a number
  return { ...t, first_visit: (data as Traffic).first_visit };
}

// the day (India time) of the first order, for the "All time" range
export async function firstOrderDay(): Promise<string | null> {
  const { data, error } = await db().from("orders").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? new Date(data.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null;
}

// ---------------------------------------------------------------- admin: geography

// orders in a range by delivery city; lat/lng is the average map pin, when any
export type GeoCity = { city: string; state: string; customers: number; orders: number; sales: number; lat: number | null; lng: number | null };

export async function geo(from: string, to: string): Promise<{ cities: GeoCity[]; customers: number }> {
  const { data, error } = await db().rpc("admin_geo", { p_from: from, p_to: to });
  if (error) throw error;
  const d = data as { cities: (Omit<GeoCity, "lat" | "lng"> & { lat: unknown; lng: unknown })[]; customers: number };
  return {
    customers: Number(d.customers),
    cities: d.cities.map((c) => ({
      city: c.city,
      state: c.state,
      customers: Number(c.customers),
      orders: Number(c.orders),
      sales: Number(c.sales),
      lat: c.lat == null ? null : Number(c.lat),
      lng: c.lng == null ? null : Number(c.lng),
    })),
  };
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
  // a seeded test account (can't sign in), tagged "Test" in the admin
  is_test: boolean;
  tags: string[];
  // from their default saved address, else their latest order
  city: string;
  state: string;
};

export async function setCustomerTags(id: string, tags: string[]) {
  const { error } = await db().rpc("admin_set_customer_tags", { p_customer: id, p_tags: tags });
  if (error) throw error;
}

export type NewCustomer = {
  name: string;
  phone: string;
  email: string;
  address: { line1: string; line2: string; city: string; state: string; pincode: string } | null;
  tags: string[];
};
// a customer typed in by the shop; their account can't sign in (0027)
export async function addCustomer(c: NewCustomer): Promise<string> {
  const { data, error } = await db().rpc("admin_add_customer", { p_name: c.name, p_phone: c.phone, p_email: c.email, p_address: c.address, p_tags: c.tags });
  if (error) throw error;
  return data as string;
}

// groups the shop builds itself (lib/customer-groups.ts)
export type Segment = { id: string; name: string; rules: import("./customer-groups").Rule[] };
export async function listSegments(): Promise<Segment[]> {
  const { data, error } = await db().from("customer_segments").select("id, name, rules").order("created_at");
  if (error) throw error;
  return (data ?? []) as Segment[];
}
export async function saveSegment(s: { id?: string; name: string; rules: Segment["rules"] }, by: string | null): Promise<Segment> {
  const q = s.id
    ? db().from("customer_segments").update({ name: s.name, rules: s.rules }).eq("id", s.id)
    : db().from("customer_segments").insert({ name: s.name, rules: s.rules, created_by: by });
  const { data, error } = await q.select("id, name, rules").single();
  if (error) throw error;
  return data as Segment;
}
export async function deleteSegment(id: string) {
  const { error } = await db().from("customer_segments").delete().eq("id", id);
  if (error) throw error;
}

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await db().rpc("admin_customers");
  if (error) throw error;
  return ((data ?? []) as Customer[]).map((c) => ({ ...c, orders: toNumber(c.orders), spent: toNumber(c.spent) }));
}

// a private note, or a logged contact with the customer that can need a follow-up (0044)
export type SupportChannel = "" | "whatsapp" | "call" | "email" | "in_person" | "instagram" | "other";
export type CustomerNote = {
  id: string;
  body: string;
  author_id: string | null;
  created_at: string;
  kind: "note" | "contact";
  channel: SupportChannel;
  order_id: string | null;
  status: "open" | "resolved" | null;
  resolved_at: string | null;
};
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

// Signed-in customers' carts with something in them (migration 0034), newest
// first. Lines are as the shop draws them; active or abandoned is decided
// from updated_at on the page.
export type AdminCartLine = { key: string; slug: string; href: string; name: string; variant: string; price?: number; unit?: string; qty: number };
export type AdminCart = {
  profile_id: string;
  full_name: string;
  phone: string;
  email: string;
  lines: AdminCartLine[];
  updated_at: string;
  last_order_at: string | null;
};
export async function adminCarts(): Promise<AdminCart[]> {
  const { data, error } = await db().rpc("admin_carts");
  if (error) throw error;
  return ((data ?? []) as AdminCart[]).map((c) => ({ ...c, lines: Array.isArray(c.lines) ? c.lines : [] }));
}

// Saved for later (the heart), from customers' accounts (migration 0033):
// products by how many customers saved them, test accounts left out.
export type SavedProduct = { slug: string; name: string; category: string; category_slug: string; saves: number; last_saved: string };
export async function savedProducts(): Promise<SavedProduct[]> {
  const { data, error } = await db().rpc("admin_saved_products");
  if (error) throw error;
  return ((data ?? []) as SavedProduct[]).map((r) => ({ ...r, saves: Number(r.saves) }));
}

// One customer's activity on the site (migration 0036): how they first
// arrived, when they were last seen, how many visits, and their latest
// events, newest first.
export type ActivityEvent = { kind: "view" | "cart" | "checkout" | "product" | "add"; path: string; label: string; device: string; referrer: string; visit: string; at: string };
export type CustomerActivity = {
  first: { at: string; referrer: string; device: string; path: string } | null;
  last_seen: string | null;
  visits: number;
  events: ActivityEvent[];
};
export async function customerActivity(id: string): Promise<CustomerActivity> {
  const { data, error } = await db().rpc("admin_customer_activity", { p_profile: id });
  if (error) throw error;
  const r = (data ?? {}) as Partial<CustomerActivity>;
  return { first: r.first ?? null, last_seen: r.last_seen ?? null, visits: Number(r.visits ?? 0), events: r.events ?? [] };
}

// one customer's saved products, newest first
export type CustomerSaved = { slug: string; name: string; href: string; price: number | null; saved_at: string };
export async function customerSaved(id: string): Promise<CustomerSaved[]> {
  const { data, error } = await db().from("saved_products").select("product_slug, item, created_at").eq("profile_id", id).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const it = (r.item ?? {}) as { name?: string; href?: string; price?: number | null };
    return { slug: r.product_slug, name: it.name ?? r.product_slug, href: it.href ?? "", price: it.price ?? null, saved_at: r.created_at };
  });
}

export async function customerDetail(id: string) {
  const sb = db();
  const [orders, addresses, notes] = await Promise.all([
    sb.from("orders").select(LIST).eq("profile_id", id).order("created_at", { ascending: false }),
    sb.from("addresses").select("id, label, recipient_name, phone, line1, line2, landmark, city, state, pincode, latitude, longitude, is_default").eq("profile_id", id).order("is_default", { ascending: false }),
    sb.from("customer_notes").select("id, body, author_id, created_at, kind, channel, order_id, status, resolved_at").eq("profile_id", id).order("created_at", { ascending: false }),
  ]);
  for (const r of [orders, addresses, notes]) if (r.error) throw r.error;
  return {
    orders: (orders.data ?? []).map(toOrder),
    addresses: (addresses.data ?? []) as CustomerAddress[],
    notes: (notes.data ?? []) as CustomerNote[],
  };
}

export async function addCustomerNote(
  profileId: string,
  authorId: string,
  body: string,
  more: { kind?: "note" | "contact"; channel?: SupportChannel; order_id?: string | null; open?: boolean } = {},
) {
  const { error } = await db()
    .from("customer_notes")
    .insert({ profile_id: profileId, author_id: authorId, body, kind: more.kind ?? "note", channel: more.channel ?? "", order_id: more.order_id ?? null, status: more.open ? "open" : more.kind === "contact" ? "resolved" : null });
  if (error) throw error;
}

// a follow-up done (or reopened)
export async function setNoteStatus(id: string, status: "open" | "resolved") {
  const { error } = await db().from("customer_notes").update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

// the customer's cancellation and return requests, with the shop's replies
export async function requestsFor(orderIds: string[]): Promise<(OrderRequest & { order_id: string })[]> {
  if (!orderIds.length) return [];
  const { data, error } = await db().from("order_requests").select("id, order_id, kind, status, reason, items, reply, created_at, resolved_at").in("order_id", orderIds);
  if (error) throw error;
  return (data ?? []) as (OrderRequest & { order_id: string })[];
}

// follow-ups still open across all customers, oldest first, for Home
export type FollowUp = { id: string; body: string; channel: SupportChannel; created_at: string; profile_id: string; name: string };
export async function openFollowUps(): Promise<FollowUp[]> {
  const { data, error } = await db().from("customer_notes").select("id, body, channel, created_at, profile_id, profiles(full_name)").eq("status", "open").order("created_at").limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const pr = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { full_name?: string } | null;
    return { id: r.id as string, body: r.body as string, channel: r.channel as SupportChannel, created_at: r.created_at as string, profile_id: r.profile_id as string, name: pr?.full_name || "A customer" };
  });
}

// ---------------------------------------------------------------- admin: stock history

export type StockMove = {
  id: string;
  variant_id: string;
  delta: number;
  qty_after: number;
  reason: "sale" | "cancel" | "refund" | "return" | "edit" | "undo" | "manual";
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
  // days after delivery a customer can ask for a return; 0 = no returns (0022)
  return_days: number;
  // an option counting stock is low at this many or fewer, unless its product sets its own (0043)
  low_stock_at: number;
  // printed on invoices and packing slips (0029)
  store_name: string;
  legal_name: string;
  gstin: string;
  store_address: string;
  store_phone: string;
  store_email: string;
  invoice_prefix: string;
  invoice_note: string;
};

// Each product's own GST bracket, by slug (null: the shop's default rate). Readable by anyone.
export async function gstRates(slugs: string[]): Promise<Map<string, number | null>> {
  if (!slugs.length) return new Map();
  const { data, error } = await db().from("products").select("slug, gst_rate").in("slug", slugs);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.slug as string, r.gst_rate == null ? null : toNumber(r.gst_rate)]));
}

// Readable by anyone: the checkout needs the delivery charge and GST rule.
export async function getSettings(): Promise<StoreSettings> {
  const { data, error } = await db().from("store_settings").select("shipping, free_shipping_over, gst_rate, gst_inclusive, gst_input_credit, store_state, return_days, low_stock_at, store_name, legal_name, gstin, store_address, store_phone, store_email, invoice_prefix, invoice_note").eq("id", 1).single();
  if (error) throw error;
  return {
    shipping: toNumber(data.shipping),
    free_shipping_over: data.free_shipping_over == null ? null : toNumber(data.free_shipping_over),
    gst_rate: toNumber(data.gst_rate),
    gst_inclusive: data.gst_inclusive,
    gst_input_credit: data.gst_input_credit,
    store_state: data.store_state ?? "",
    return_days: data.return_days ?? 7,
    low_stock_at: data.low_stock_at ?? 3,
    store_name: data.store_name ?? "Babajee",
    legal_name: data.legal_name ?? "",
    gstin: data.gstin ?? "",
    store_address: data.store_address ?? "",
    store_phone: data.store_phone ?? "",
    store_email: data.store_email ?? "",
    invoice_prefix: data.invoice_prefix ?? "BJ",
    invoice_note: data.invoice_note ?? "",
  };
}

// Low and out-of-stock options (0043): each with its product, stock and low mark.
export type LowItem = { variant_id: string; product_id: string; product: string; option: string; stock: number; mark: number; out: boolean };
export async function lowStock(): Promise<LowItem[]> {
  const { data, error } = await db().rpc("admin_low_stock");
  if (error) throw error;
  return (data ?? []) as LowItem[];
}

export async function saveSettings(s: StoreSettings) {
  const { error } = await db().from("store_settings").update(s).eq("id", 1);
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: cost + profit

// Cost prices (with GST), by option id. Admin-only table (0015), never shown to customers.
export async function getCosts(variantIds: string[]): Promise<Map<string, number>> {
  return new Map([...(await getPurchases(variantIds))].map(([id, c]) => [id, c.cost]));
}

// Purchase price (before GST) and cost price (purchase + GST at the
// product's bracket), by option id. purchase is null for a cost typed before 0030.
export async function getPurchases(variantIds: string[]): Promise<Map<string, { purchase: number | null; cost: number }>> {
  if (!variantIds.length) return new Map();
  const { data, error } = await db().from("variant_costs").select("variant_id, purchase, cost").in("variant_id", variantIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.variant_id as string, { purchase: r.purchase == null ? null : toNumber(r.purchase), cost: toNumber(r.cost) }]));
}

// The purchase price, before GST; the database adds the GST to make the cost
// price. null clears it (no cost known). Returns the new cost price.
export async function setPurchase(variantId: string, purchase: number | null): Promise<number | null> {
  const q = db().from("variant_costs");
  if (purchase == null) {
    const { error } = await q.delete().eq("variant_id", variantId);
    if (error) throw error;
    return null;
  }
  const { data, error } = await q.upsert({ variant_id: variantId, purchase, cost: purchase }).select("cost").single();
  if (error) throw error;
  return toNumber(data.cost);
}

// Units each product has sold, all time (cancelled orders and refunded units left out), by product id.
export async function unitsSold(): Promise<Map<string, number>> {
  const { data, error } = await db().rpc("admin_units_sold");
  if (error) throw error;
  return new Map(((data ?? []) as { product_id: string; units: number }[]).map((r) => [r.product_id, toNumber(r.units)]));
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
  // with GST, as the customer paid
  sales: number;
  net_sales: number;
  // with GST, on the items that have a cost price
  costed_sales: number;
  // cost prices with GST
  cost: number;
  // the client's rule: selling price with GST - cost price with GST (0030)
  profit: number;
  // what is left once the GST owed is paid
  kept: number;
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
    sales: n(p.sales),
    net_sales: n(p.net_sales),
    kept: n(p.kept),
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

export type ReportKind = "products" | "customers" | "stock" | "finance" | "gst" | DeliveryKind;
export type ReportRow = Record<string, string | number | boolean | null>;
export type DeliveryKind = "couriers" | "places" | "late";

// One report's rows for a date range (0016). Columns per kind are listed on
// the Reports page. The delivery reports are worked out here from the
// shipments recorded on each order.
export async function report(kind: ReportKind, from: string, to: string): Promise<ReportRow[]> {
  if (kind === "couriers" || kind === "places" || kind === "late") return deliveryReport(kind, from, to);
  const { data, error } = await db().rpc("admin_report", { p_kind: kind, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as ReportRow[];
}

// ---------------------------------------------------------------- requests (0022)

// The customer's cancel button: an unpaid order cancels at once ("cancelled");
// a paid one asks the shop ("requested").
export async function cancelMyOrder(id: string, reason: string): Promise<"cancelled" | "requested"> {
  const { data, error } = await db().rpc("customer_cancel_order", { p_order: id, p_reason: reason });
  if (error) throw error;
  return data as "cancelled" | "requested";
}

export async function requestReturn(id: string, items: { item: string; qty: number }[], reason: string) {
  const { error } = await db().rpc("customer_request_return", { p_order: id, p_items: items, p_reason: reason });
  if (error) throw error;
}

export async function withdrawRequest(id: string) {
  const { error } = await db().rpc("customer_withdraw_request", { p_request: id });
  if (error) throw error;
}

// the shop's answer; accept after the refund or cancellation is recorded
export async function resolveRequest(id: string, accept: boolean, reply: string) {
  const { error } = await db().rpc("admin_resolve_request", { p_request: id, p_accept: accept, p_reply: reply });
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: new order

export type NewOrder = {
  customer: string | null;
  contact: { name: string; phone: string; email: string };
  address: { line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; latitude: number | null; longitude: number | null };
  lines: { variant: string; qty: number; price?: number }[];
  shipping: number | null;
  notes: string;
  paid: boolean;
};

// An order taken by the shop (phone, WhatsApp, counter); see 0018.
export async function createOrder(n: NewOrder): Promise<{ id: string; number: string }> {
  const { data, error } = await db().rpc("admin_create_order", {
    p_customer: n.customer,
    p_contact: n.contact,
    p_address: n.address,
    p_lines: n.lines,
    p_shipping: n.shipping,
    p_notes: n.notes,
    p_paid: n.paid,
  });
  if (error) throw error;
  const row = (data as { order_id: string; order_number: string }[])[0];
  return { id: row.order_id, number: row.order_number };
}

export async function customerAddresses(id: string): Promise<CustomerAddress[]> {
  const { data, error } = await db()
    .from("addresses")
    .select("id, label, recipient_name, phone, line1, line2, landmark, city, state, pincode, latitude, longitude, is_default")
    .eq("profile_id", id)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerAddress[];
}

// ---------------------------------------------------------------- delivery reports

// Late: shipped this many days ago or more and still not delivered.
export const LATE_DAYS = 7;

type ShipRow = {
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  orders: { id: string; order_number: string; contact_name: string; address_city: string; address_state: string; status: string; delivery_attempts: number } | null;
};

// How deliveries went, from each order's latest shipment: by courier and by
// state for orders shipped in the range, and every order still out after
// LATE_DAYS (whatever the range: those need chasing now).
async function deliveryReport(kind: DeliveryKind, from: string, to: string): Promise<ReportRow[]> {
  const DAY = 864e5;
  const now = Date.now();
  let q = db()
    .from("shipments")
    .select("carrier, tracking_number, shipped_at, delivered_at, orders(id, order_number, contact_name, address_city, address_state, status, delivery_attempts)")
    .not("shipped_at", "is", null)
    .order("shipped_at", { ascending: true })
    .limit(5000);
  if (kind === "late") q = q.is("delivered_at", null).lt("shipped_at", new Date(now - LATE_DAYS * DAY).toISOString());
  else q = q.gte("shipped_at", `${from}T00:00:00+05:30`).lte("shipped_at", `${to}T23:59:59.999+05:30`);
  const { data, error } = await q;
  if (error) throw error;

  // an order sent again has more than one shipment: its latest one counts
  const latest = new Map<string, ShipRow>();
  for (const r of (data ?? []) as unknown as ShipRow[]) if (r.orders) latest.set(r.orders.id, r);
  const ships = [...latest.values()];

  if (kind === "late")
    return ships
      .filter((r) => r.orders!.status === "shipped")
      .map((r) => ({
        order: r.orders!.order_number,
        order_id: r.orders!.id,
        customer: r.orders!.contact_name,
        city: r.orders!.address_city,
        state: r.orders!.address_state,
        courier: r.carrier?.trim() || "Not recorded",
        tracking: r.tracking_number || null,
        shipped: r.shipped_at!.slice(0, 10),
        days_out: Math.floor((now - new Date(r.shipped_at!).getTime()) / DAY),
        failed: r.orders!.delivery_attempts || null,
      }))
      .sort((a, b) => b.days_out - a.days_out);

  const groups = new Map<string, ShipRow[]>();
  for (const r of ships) {
    const key = kind === "couriers" ? r.carrier?.trim() || "Not recorded" : r.orders!.address_state || "Unknown";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const rows: ReportRow[] = [];
  for (const [key, list] of groups) {
    const done = list.filter((r) => r.delivered_at);
    const days = done.map((r) => (new Date(r.delivered_at!).getTime() - new Date(r.shipped_at!).getTime()) / DAY).sort((a, b) => a - b);
    const out = list.filter((r) => !r.delivered_at && r.orders!.status === "shipped");
    rows.push({
      [kind === "couriers" ? "courier" : "state"]: key,
      shipped: list.length,
      delivered: done.length,
      on_the_way: out.length,
      late: out.filter((r) => now - new Date(r.shipped_at!).getTime() >= LATE_DAYS * DAY).length,
      failed: list.filter((r) => r.orders!.delivery_attempts > 0).length,
      came_back: list.filter((r) => !r.delivered_at && r.orders!.status === "refunded").length,
      avg_days: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      slowest: days.length ? Math.round(days[days.length - 1] * 10) / 10 : null,
      delivered_rate: list.length ? (done.length / list.length) * 100 : null,
    });
  }
  return rows.sort((a, b) => Number(b.shipped) - Number(a.shipped));
}
