import { toNumber } from "../currency";
import { LIST, OrderRequest, db, toOrder } from "./core";

export type Customer = {
  id: string;
  // yyyy-mm-dd, asked at sign-up (0045); none for an account made by hand
  date_of_birth?: string | null;
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
  const { error } = await (await db()).rpc("admin_set_customer_tags", { p_customer: id, p_tags: tags });
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
  const { data, error } = await (await db()).rpc("admin_add_customer", { p_name: c.name, p_phone: c.phone, p_email: c.email, p_address: c.address, p_tags: c.tags });
  if (error) throw error;
  return data as string;
}
// groups the shop builds itself (lib/customer-groups.ts)
export type Segment = { id: string; name: string; rules: import("../customer-groups").Rule[] };
export async function listSegments(): Promise<Segment[]> {
  const { data, error } = await (await db()).from("customer_segments").select("id, name, rules").order("created_at");
  if (error) throw error;
  return (data ?? []) as Segment[];
}
export async function saveSegment(s: { id?: string; name: string; rules: Segment["rules"] }, by: string | null): Promise<Segment> {
  const q = s.id
    ? (await db()).from("customer_segments").update({ name: s.name, rules: s.rules }).eq("id", s.id)
    : (await db()).from("customer_segments").insert({ name: s.name, rules: s.rules, created_by: by });
  const { data, error } = await q.select("id, name, rules").single();
  if (error) throw error;
  return data as Segment;
}
export async function deleteSegment(id: string) {
  const { error } = await (await db()).from("customer_segments").delete().eq("id", id);
  if (error) throw error;
}
export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await (await db()).rpc("admin_customers");
  if (error) throw error;
  return ((data ?? []) as Customer[]).map((c) => ({ ...c, orders: toNumber(c.orders), spent: toNumber(c.spent) }));
}
// One customer's row (0080); before 0080 is applied, picked out of the full list.
export async function getCustomer(id: string): Promise<Customer | null> {
  const { data, error } = await (await db()).rpc("admin_customer", { p_id: id });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return (await listCustomers()).find((x) => x.id === id) ?? null;
    throw error;
  }
  const c = ((data ?? []) as Customer[])[0];
  return c ? { ...c, orders: toNumber(c.orders), spent: toNumber(c.spent) } : null;
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
  // reminders the shop sent by hand (0067)
  reminded_at: string | null;
  reminders: number;
};
export async function adminCarts(): Promise<AdminCart[]> {
  const { data, error } = await (await db()).rpc("admin_carts");
  if (error) throw error;
  return ((data ?? []) as AdminCart[]).map((c) => ({ ...c, lines: Array.isArray(c.lines) ? c.lines : [], reminded_at: c.reminded_at ?? null, reminders: Number(c.reminders ?? 0) }));
}
// Live view (0069): visits active in the last few minutes, the pages being
// looked at, and today so far.
export type LiveSession = { session: string; page: string; looking_at: string; last_at: string; started: string; device: string; referrer: string; campaign: string; pages: number; adds: number; checkout: boolean; customer: string };
export type LiveView = { minutes: number; now: string; visitors: number; sessions: LiveSession[]; pages: { page: string; visitors: number }[]; today: { visits: number; orders: number; sales: number } };
export async function liveView(minutes = 5): Promise<LiveView> {
  const { data, error } = await (await db()).rpc("admin_live_view", { p_minutes: minutes });
  if (error) throw error;
  const r = data as LiveView;
  return { ...r, today: { visits: Number(r.today?.visits ?? 0), orders: Number(r.today?.orders ?? 0), sales: Number(r.today?.sales ?? 0) } };
}
// the shop sent this customer a reminder itself (0067)
export async function markCartReminded(customer: string) {
  const { error } = await (await db()).rpc("admin_mark_cart_reminded", { p_customer: customer });
  if (error) throw error;
}
// Cart-to-order conversion over a range (0067): visits, visits that added to
// the cart, reached checkout, ordered, and added-then-ordered; signed-in
// customers who added to a cart and of those who ordered.
export type CartConversion = { visits: number; carted: number; checkout: number; ordered: number; carted_ordered: number; accounts_carted: number; accounts_ordered: number };
export async function cartConversion(from: Date, to: Date): Promise<CartConversion> {
  const { data, error } = await (await db()).rpc("admin_cart_conversion", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw error;
  const r = ((data ?? [])[0] ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(r[k] ?? 0);
  return { visits: n("visits"), carted: n("carted"), checkout: n("checkout"), ordered: n("ordered"), carted_ordered: n("carted_ordered"), accounts_carted: n("accounts_carted"), accounts_ordered: n("accounts_ordered") };
}
// Saved for later (the heart), from customers' accounts (migration 0033):
// products by how many customers saved them, test accounts left out.
export type SavedProduct = { slug: string; name: string; category: string; category_slug: string; saves: number; last_saved: string };
export async function savedProducts(): Promise<SavedProduct[]> {
  const { data, error } = await (await db()).rpc("admin_saved_products");
  if (error) throw error;
  return ((data ?? []) as SavedProduct[]).map((r) => ({ ...r, saves: Number(r.saves) }));
}
// One customer's activity on the site (migration 0036): how they first
// arrived, when they were last seen, how many visits, and their latest
// events, newest first.
export type ActivityEvent = { kind: "view" | "cart" | "checkout" | "product" | "add" | "search" | "step"; path: string; label: string; device: string; referrer: string; visit: string; at: string };
export type CustomerActivity = {
  first: { at: string; referrer: string; device: string; path: string } | null;
  last_seen: string | null;
  visits: number;
  events: ActivityEvent[];
};
export async function customerActivity(id: string): Promise<CustomerActivity> {
  const { data, error } = await (await db()).rpc("admin_customer_activity", { p_profile: id });
  if (error) throw error;
  const r = (data ?? {}) as Partial<CustomerActivity>;
  return { first: r.first ?? null, last_seen: r.last_seen ?? null, visits: Number(r.visits ?? 0), events: r.events ?? [] };
}
// one customer's saved products, newest first
export type CustomerSaved = { slug: string; name: string; href: string; price: number | null; saved_at: string };
export async function customerSaved(id: string): Promise<CustomerSaved[]> {
  const { data, error } = await (await db()).from("saved_products").select("product_slug, item, created_at").eq("profile_id", id).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const it = (r.item ?? {}) as { name?: string; href?: string; price?: number | null };
    return { slug: r.product_slug, name: it.name ?? r.product_slug, href: it.href ?? "", price: it.price ?? null, saved_at: r.created_at };
  });
}
// A customer's account details (0066): names, gender, individual or
// business with its GSTIN, and status; null before that is in place.
export type CustomerAccount = {
  first_name: string;
  last_name: string;
  gender: "" | "female" | "male" | "other";
  customer_type: "individual" | "business";
  business_name: string;
  gstin: string;
  status: "active" | "inactive" | "blocked";
  status_note: string;
};
export async function customerAccount(id: string): Promise<CustomerAccount | null> {
  const { data, error } = await (await db()).from("profiles").select("first_name, last_name, gender, customer_type, business_name, gstin, status, status_note").eq("id", id).maybeSingle();
  if (error) return null;
  return (data as CustomerAccount | null) ?? null;
}
export async function updateCustomer(id: string, patch: Partial<CustomerAccount>) {
  const { error } = await (await db()).rpc("admin_update_customer", { p_customer: id, p: patch });
  if (error) throw error;
}
export async function customerDetail(id: string) {
  const sb = (await db());
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
  const { error } = await (await db())
    .from("customer_notes")
    .insert({ profile_id: profileId, author_id: authorId, body, kind: more.kind ?? "note", channel: more.channel ?? "", order_id: more.order_id ?? null, status: more.open ? "open" : more.kind === "contact" ? "resolved" : null });
  if (error) throw error;
}
// a follow-up done (or reopened)
export async function setNoteStatus(id: string, status: "open" | "resolved") {
  const { error } = await (await db()).from("customer_notes").update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}
// the customer's cancellation and return requests, with the shop's replies
export async function requestsFor(orderIds: string[]): Promise<(OrderRequest & { order_id: string })[]> {
  if (!orderIds.length) return [];
  const { data, error } = await (await db()).from("order_requests").select("id, order_id, kind, status, reason, items, reply, created_at, resolved_at").in("order_id", orderIds);
  if (error) throw error;
  return (data ?? []) as (OrderRequest & { order_id: string })[];
}
// follow-ups still open across all customers, oldest first, for Home
export type FollowUp = { id: string; body: string; channel: SupportChannel; created_at: string; profile_id: string; name: string };
export async function openFollowUps(): Promise<FollowUp[]> {
  const { data, error } = await (await db()).from("customer_notes").select("id, body, channel, created_at, profile_id, profiles(full_name)").eq("status", "open").order("created_at").limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const pr = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { full_name?: string } | null;
    return { id: r.id as string, body: r.body as string, channel: r.channel as SupportChannel, created_at: r.created_at as string, profile_id: r.profile_id as string, name: pr?.full_name || "A customer" };
  });
}

// ---------------------------------------------------------------- admin: stock history
