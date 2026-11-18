import { db } from "./core";

export type HomeCounts = Record<"requests" | "unpaid" | "to_pack" | "to_ship" | "in_transit" | "out_of_stock" | "low_stock" | "unpriced", number>;
export async function homeCounts(): Promise<HomeCounts> {
  const { data, error } = await (await db()).rpc("admin_home_counts");
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
export function numbers<T>(x: T): T {
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
  const { data, error } = await (await db()).rpc("admin_sales_by_category", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as CategorySales[]).map((r) => ({ ...r, qty: Number(r.qty), sales: Number(r.sales) }));
}
// Who buys, by age (0046): orders in the dates by the buyer's age band, and
// every customer account by band
export type AgeBand = { band: string; buyers: number; orders: number; sales: number };
export type AgeSales = { bands: AgeBand[]; accounts: { band: string; n: number }[] };
export async function salesByAge(from: string, to: string): Promise<AgeSales> {
  const { data, error } = await (await db()).rpc("admin_sales_by_age", { p_from: from, p_to: to });
  if (error) throw error;
  const d = (data ?? { bands: [], accounts: [] }) as AgeSales;
  return {
    bands: d.bands.map((b) => ({ ...b, buyers: Number(b.buyers), orders: Number(b.orders), sales: Number(b.sales) })),
    accounts: d.accounts.map((a) => ({ ...a, n: Number(a.n) })),
  };
}
export async function analytics(from: string, to: string): Promise<Analytics> {
  const { data, error } = await (await db()).rpc("admin_analytics", { p_from: from, p_to: to });
  if (error) throw error;
  return numbers(data as Analytics);
}

// ---------------------------------------------------------------- admin: traffic
// Visits grouped into sessions. A bounce is a visit that saw one page and
// went no further; "cart" and "checkout" count visits that reached them.
export type TrafficGroup = { name: string; sessions: number; views: number; bounced: number; cart: number; checkout: number; ordered: number; sales: number };
export type Traffic = {
  sessions: number;
  views: number;
  bounced: number;
  engaged_secs: number;
  cart_sessions: number;
  checkout_sessions: number;
  orders: number;
  orders_linked: number;
  first_visit: string | null;
  daily: { day: string; sessions: number; views: number }[];
  sources: TrafficGroup[];
  devices: TrafficGroup[];
  landing: { name: string; sessions: number; bounced: number; checkout: number; ordered: number }[];
  pages: { name: string; views: number; visitors: number }[];
  hours: { dow: number; hour: number; sessions: number }[];
  categories: { name: string; views: number; visitors: number; units: number; sales: number }[];
};
export async function traffic(from: string, to: string): Promise<Traffic> {
  const { data, error } = await (await db()).rpc("admin_traffic", { p_from: from, p_to: to });
  if (error) throw error;
  const t = numbers(data as Traffic);
  // first_visit is a timestamp, not a number
  return { ...t, first_visit: (data as Traffic).first_visit };
}
// searches, checkout steps, campaigns, returning visitors and the visits an
// order took (migration 0049)
export type TrafficInsights = {
  searches: { q: string; visits: number; avg_hits: number; empty: number }[];
  empty_searches: { q: string; visits: number }[];
  search_visits: number;
  steps: { step: string; visits: number; times: number }[];
  checkout_visits: number;
  campaigns: { name: string; visits: number; ordered: number; sales: number }[];
  visitors: number;
  new_visitors: number;
  returning_visitors: number;
  visits_untagged: number;
  to_order: {
    orders: number;
    visits_median: number | null;
    visits_avg: number | null;
    days_median: number | null;
    first_visit: number;
    two_three: number;
    four_plus: number;
  };
};
export async function trafficInsights(from: string, to: string): Promise<TrafficInsights> {
  const { data, error } = await (await db()).rpc("admin_traffic_insights", { p_from: from, p_to: to });
  if (error) throw error;
  return numbers(data as TrafficInsights);
}
// the day (India time) of the first order, for the "All time" range
export async function firstOrderDay(): Promise<string | null> {
  const { data, error } = await (await db()).from("orders").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? new Date(data.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null;
}

// ---------------------------------------------------------------- admin: geography
// orders in a range by delivery city; lat/lng is the average map pin, when any
export type GeoCity = { city: string; state: string; customers: number; orders: number; sales: number; lat: number | null; lng: number | null };
export async function geo(from: string, to: string): Promise<{ cities: GeoCity[]; customers: number }> {
  const { data, error } = await (await db()).rpc("admin_geo", { p_from: from, p_to: to });
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
export type ReportKind = "products" | "customers" | "stock" | "finance" | "gst" | DeliveryKind | InsightKind;
// the reports from 0068 (admin_insights)
export type InsightKind = "product_funnel" | "exit_pages" | "worst_sellers" | "returns" | "return_reasons" | "new_customers" | "marketing" | "refunds";
export const INSIGHTS: string[] = ["product_funnel", "exit_pages", "worst_sellers", "returns", "return_reasons", "new_customers", "marketing", "refunds"];
export type ReportRow = Record<string, string | number | boolean | null>;
export type DeliveryKind = "couriers" | "places" | "late";
// One report's rows for a date range (0016). Columns per kind are listed on
// the Reports page. The delivery reports are worked out here from the
// shipments recorded on each order.
export async function report(kind: ReportKind, from: string, to: string): Promise<ReportRow[]> {
  if (kind === "couriers" || kind === "places" || kind === "late") return deliveryReport(kind, from, to);
  if (INSIGHTS.includes(kind)) {
    const { data, error } = await (await db()).rpc("admin_insights", { p_kind: kind, p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []) as ReportRow[];
  }
  const { data, error } = await (await db()).rpc("admin_report", { p_kind: kind, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as ReportRow[];
}

// ---------------------------------------------------------------- requests (0022)
// Late: shipped this many days ago or more and still not delivered.
export const LATE_DAYS = 7;
export type ShipRow = {
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  orders: { id: string; order_number: string; contact_name: string; address_city: string; address_state: string; status: string; delivery_attempts: number } | null;
};
// How deliveries went, from each order's latest shipment: by courier and by
// state for orders shipped in the range, and every order still out after
// LATE_DAYS (whatever the range: those need chasing now).
export async function deliveryReport(kind: DeliveryKind, from: string, to: string): Promise<ReportRow[]> {
  const DAY = 864e5;
  const now = Date.now();
  let q = (await db())
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
