import { toNumber } from "../currency";
import { db } from "./core";

export type StockMove = {
  id: string;
  variant_id: string;
  delta: number;
  qty_after: number;
  reason: "sale" | "cancel" | "refund" | "return" | "edit" | "undo" | "manual" | "stock_in" | "void" | "correction";
  receipt_id: string | null;
  note: string;
  order_id: string | null;
  created_at: string;
  product_name: string;
  product_id: string | null;
  label: string;
  order_number: string | null;
};
// The stock changes, newest first: for some options (a product's history), or
// the whole shop's (Inventory › Stock history), a page at a time (before: the
// oldest created_at already shown).
export async function stockHistory(variantIds?: string[], opts: { limit?: number; before?: string } = {}): Promise<StockMove[]> {
  let q = (await db())
    .from("stock_movements")
    .select("id, variant_id, delta, qty_after, reason, order_id, receipt_id, note, created_at, product_variants(label, product_id, products(name)), orders(order_number)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (variantIds) q = q.in("variant_id", variantIds);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) throw error;
  type Row = Omit<StockMove, "product_name" | "label" | "order_number" | "product_id"> & {
    product_variants: { label: string; product_id: string; products: { name: string } | null } | null;
    orders: { order_number: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map(({ product_variants, orders, ...m }) => ({
    ...m,
    product_id: product_variants?.product_id ?? null,
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
  // CESS on top of GST, per product (0060); off unless switched on
  cess_enabled: boolean;
  // a cart left this many hours with no order is abandoned; one untouched
  // this many days is emptied, 0 = never (0067)
  cart_abandon_hours: number;
  cart_expire_days: number;
  store_state: string;
  // days after delivery a customer can ask for a return; 0 = no returns (0022)
  return_days: number;
  // hours an unpaid order holds its stock before it cancels itself; 0 = never (0055)
  unpaid_hours: number;
  // the ways a customer can pay, offered in "Mark paid" (0056)
  payment_methods: string[];
  // an option counting stock is low at this many or fewer, unless its product sets its own (0043)
  low_stock_at: number;
  // printed on invoices (0029)
  store_name: string;
  legal_name: string;
  gstin: string;
  store_address: string;
  store_phone: string;
  store_email: string;
  invoice_prefix: string;
  invoice_note: string;
  // for bank transfers and UPI: on the invoice and given to customers who pay that way (0005)
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_upi_id: string;
};
// Each product's own GST bracket (null: the shop's default rate) and cess
// rate (0060; charged only with cess switched on), by slug. Readable by anyone.
export async function gstRates(slugs: string[]): Promise<Map<string, { gst: number | null; cess: number }>> {
  if (!slugs.length) return new Map();
  // cess rates (0060) read on their own: none before that is in place
  const [{ data, error }, cess] = await Promise.all([
    (await db()).from("products").select("slug, gst_rate").in("slug", slugs),
    (await db()).from("products").select("slug, cess_rate").in("slug", slugs),
  ]);
  if (error) throw error;
  const c = new Map(cess.error ? [] : (cess.data ?? []).map((r) => [r.slug as string, toNumber(r.cess_rate ?? 0)]));
  return new Map((data ?? []).map((r) => [r.slug as string, { gst: r.gst_rate == null ? null : toNumber(r.gst_rate), cess: c.get(r.slug as string) ?? 0 }]));
}
// Readable by anyone: the checkout needs the delivery charge and GST rule.
export async function getSettings(): Promise<StoreSettings> {
  // cess (0060) read on its own: a database without it still gives the rest
  const cessP = (await db()).from("store_settings").select("cess_enabled").eq("id", 1).maybeSingle();
  const cartP = (await db()).from("store_settings").select("cart_abandon_hours, cart_expire_days").eq("id", 1).maybeSingle();
  const { data, error } = await (await db()).from("store_settings").select("shipping, free_shipping_over, gst_rate, gst_inclusive, gst_input_credit, store_state, return_days, unpaid_hours, payment_methods, low_stock_at, store_name, legal_name, gstin, store_address, store_phone, store_email, invoice_prefix, invoice_note, bank_account_name, bank_account_number, bank_ifsc, bank_upi_id").eq("id", 1).single();
  if (error) throw error;
  const cess = await cessP;
  const cart = await cartP;
  return {
    shipping: toNumber(data.shipping),
    free_shipping_over: data.free_shipping_over == null ? null : toNumber(data.free_shipping_over),
    gst_rate: toNumber(data.gst_rate),
    gst_inclusive: data.gst_inclusive,
    gst_input_credit: data.gst_input_credit,
    cess_enabled: !cess.error && !!cess.data?.cess_enabled,
    cart_abandon_hours: (!cart.error && cart.data?.cart_abandon_hours) || 1,
    cart_expire_days: !cart.error && cart.data ? (cart.data.cart_expire_days ?? 30) : 30,
    store_state: data.store_state ?? "",
    return_days: data.return_days ?? 7,
    unpaid_hours: data.unpaid_hours ?? 48,
    payment_methods: (data.payment_methods as string[] | null) ?? ["UPI", "Bank transfer", "Cash"],
    low_stock_at: data.low_stock_at ?? 3,
    store_name: data.store_name ?? "Babajee",
    legal_name: data.legal_name ?? "",
    gstin: data.gstin ?? "",
    store_address: data.store_address ?? "",
    store_phone: data.store_phone ?? "",
    store_email: data.store_email ?? "",
    invoice_prefix: data.invoice_prefix ?? "BJ",
    invoice_note: data.invoice_note ?? "",
    bank_account_name: data.bank_account_name ?? "",
    bank_account_number: data.bank_account_number ?? "",
    bank_ifsc: data.bank_ifsc ?? "",
    bank_upi_id: data.bank_upi_id ?? "",
  };
}
// The shop's courier list (0079), offered when an order is shipped. Read and
// saved on its own: null where the database doesn't have it yet.
export async function getCouriers(): Promise<string[] | null> {
  const { data, error } = await (await db()).from("store_settings").select("couriers").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return (data.couriers as string[] | null) ?? [];
}
export async function saveCouriers(list: string[]) {
  const { error } = await (await db()).from("store_settings").update({ couriers: list }).eq("id", 1);
  if (error) throw error;
}
// Low and out-of-stock options (0043): each with its product, stock and low mark.
export type LowItem = { variant_id: string; product_id: string; product: string; option: string; stock: number; mark: number; out: boolean };
export async function lowStock(): Promise<LowItem[]> {
  const { data, error } = await (await db()).rpc("admin_low_stock");
  if (error) throw error;
  return (data ?? []) as LowItem[];
}
export async function saveSettings(s: Partial<StoreSettings>) {
  const { error } = await (await db()).from("store_settings").update(s).eq("id", 1);
  if (error) throw error;
}

// ---------------------------------------------------------------- admin: cost + profit
// Cost prices (with GST), by option id. Admin-only table (0015), never shown to customers.
export async function getCosts(variantIds: string[]): Promise<Map<string, number>> {
  return new Map([...(await getPurchases(variantIds))].map(([id, c]) => [id, c.cost]));
}
// What an option cost, per piece (admin-only; 0015/0030/0057/0059): the
// purchase price before GST, the GST paid to the supplier (averaged across
// bills, or as typed; null: none known, so the product's own rate is used),
// the part of it that can be claimed back (bills from suppliers with a GSTIN;
// a typed price counts in full), and the cost price (purchase + GST paid).
// purchase is null for a cost typed before 0030.
export type Purchase = { purchase: number | null; cost: number; gstPaid: number | null; gstClaimable: number | null };
export const num = (v: unknown) => (v == null ? null : toNumber(v));
export async function getPurchases(variantIds: string[]): Promise<Map<string, Purchase>> {
  if (!variantIds.length) return new Map();
  const { data, error } = await (await db()).from("variant_costs").select("variant_id, purchase, cost, gst_paid, gst_claimable").in("variant_id", variantIds);
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [r.variant_id as string, { purchase: num(r.purchase), cost: toNumber(r.cost), gstPaid: num(r.gst_paid), gstClaimable: num(r.gst_claimable) }]),
  );
}
// Correct an option's buying price (0057): the price before GST, the GST on
// the bill as a rate, or as the exact amount per piece (wins; 0059), and
// why. Kept with the reason; later bills average against it. Returns the
// new cost price.
export async function correctPurchase(variantId: string, purchase: number, gstRate: number | null, reason: string, gstAmount: number | null = null): Promise<number> {
  const { data, error } = await (await db()).rpc("admin_set_purchase", { p_variant: variantId, p_purchase: purchase, p_gst_rate: gstRate, p_reason: reason, p_gst_amount: gstAmount });
  if (error) throw error;
  return toNumber(data);
}
// The purchase price before GST, and the GST paid to the supplier as a rate
// (null: the product's own bracket) or an amount per piece (wins over the
// rate; null: worked out from the rate). The database works out the GST paid
// and the cost price. null purchase clears it all (no cost known).
export async function setPurchase(variantId: string, purchase: number | null, gst?: { rate: number | null; amount: number | null }): Promise<Purchase | null> {
  const q = (await db()).from("variant_costs");
  if (purchase == null) {
    const { error } = await q.delete().eq("variant_id", variantId);
    if (error) throw error;
    return null;
  }
  // a typed price is a correction too (0057), with the GST paid to the
  // supplier as a rate (null: the product's own) or an exact amount (0059)
  await correctPurchase(variantId, purchase, gst?.rate ?? null, "Typed in the product panel", gst?.amount ?? null);
  return (await getPurchases([variantId])).get(variantId) ?? null;
}
// Units each product has sold, all time (cancelled orders and refunded units left out), by product id.
export async function unitsSold(): Promise<Map<string, number>> {
  const { data, error } = await (await db()).rpc("admin_units_sold");
  if (error) throw error;
  return new Map(((data ?? []) as { product_id: string; units: number }[]).map((r) => [r.product_id, toNumber(r.units)]));
}
// The cost each line of an order sold at, by order line id, with the GST
// paid to the supplier in it and the part that can be claimed back (kept at
// sale since 0059; null before, then estimated at the selling rate).
export type SoldCost = { cost: number; gst: number | null; itc: number | null };
export async function soldCosts(itemIds: string[]): Promise<Map<string, SoldCost>> {
  if (!itemIds.length) return new Map();
  const { data, error } = await (await db()).from("order_item_costs").select("order_item_id, unit_cost, unit_gst, unit_itc").in("order_item_id", itemIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.order_item_id as string, { cost: toNumber(r.unit_cost), gst: num(r.unit_gst), itc: num(r.unit_itc) }]));
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
  // cess collected (0060), paid over in full
  cess_collected: number;
  // GST paid to suppliers on what sold, the part claimed back (input tax
  // credit, 0059), and what is left to pay over: collected - claimed back
  gst_paid: number;
  itc: number;
  gst_owed: number;
  // kept, had nothing been claimed back
  kept_no_itc: number;
  // sold lines whose GST paid to the supplier is estimated at the selling
  // rate (sold before 0059 and never costed since)
  estimated_gst_lines: number;
  daily: { day: string; profit: number }[];
  top: { name: string; qty: number; sales: number; profit: number }[];
};
export async function profit(from: string, to: string): Promise<Profit> {
  const { data, error } = await (await db()).rpc("admin_profit", { p_from: from, p_to: to });
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
    itc: n(p.itc),
    cess_collected: n(p.cess_collected ?? 0),
    gst_owed: n(p.gst_owed),
    kept_no_itc: n(p.kept_no_itc),
    estimated_gst_lines: n(p.estimated_gst_lines),
    daily: p.daily.map((d) => ({ day: d.day, profit: n(d.profit) })),
    top: p.top.map((t) => ({ ...t, qty: n(t.qty), sales: n(t.sales), profit: n(t.profit) })),
  };
}

// ---------------------------------------------------------------- admin: reports
