import { toNumber } from "./currency";
import { db } from "./orders/core";

// The counter till (supabase/migrations/0085_counter_sales.sql): its
// settings, ringing up a sale, the cash drawer and the counter's own list
// of sales. Before 0085 is applied every read here comes back null, and the
// till says so instead of failing.

export type ReceiptSize = "58mm" | "80mm" | "A4";
export type CounterSettings = {
  // a cash drawer with a float, pay in / out and an end-of-day count
  drawer: boolean;
  // the ways to pay offered at the till, in order; empty = the shop's
  // payment methods (Settings › Payments)
  methods: string[];
  // which of them is cash: the only one that can give change
  cashMethod: string;
  discounts: boolean;
  maxDiscount: number;
  priceChange: boolean;
  // sell an item counting stock with none left (the count goes below zero)
  negativeStock: boolean;
  autoPrint: boolean;
  receiptSize: ReceiptSize;
  receiptHeader: string;
  receiptFooter: string;
  receiptGstin: boolean;
  // the float suggested when opening the drawer
  float: number;
  walkinName: string;
};

const COLS =
  "counter_drawer, counter_methods, counter_cash_method, counter_discounts, counter_max_discount, counter_price_change, counter_negative_stock, counter_auto_print, counter_receipt_size, counter_receipt_header, counter_receipt_footer, counter_receipt_gstin, counter_float, counter_walkin_name";

// null: the database doesn't have the till yet (0085 not applied)
export async function getCounterSettings(): Promise<CounterSettings | null> {
  const { data, error } = await (await db()).from("store_settings").select(COLS).eq("id", 1).maybeSingle();
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    drawer: !!d.counter_drawer,
    methods: (d.counter_methods as string[] | null) ?? [],
    cashMethod: String(d.counter_cash_method ?? "Cash"),
    discounts: !!d.counter_discounts,
    maxDiscount: toNumber(d.counter_max_discount),
    priceChange: !!d.counter_price_change,
    negativeStock: !!d.counter_negative_stock,
    autoPrint: !!d.counter_auto_print,
    receiptSize: (d.counter_receipt_size as ReceiptSize) ?? "80mm",
    receiptHeader: String(d.counter_receipt_header ?? ""),
    receiptFooter: String(d.counter_receipt_footer ?? ""),
    receiptGstin: !!d.counter_receipt_gstin,
    float: toNumber(d.counter_float),
    walkinName: String(d.counter_walkin_name ?? "Walk-in customer"),
  };
}

export async function saveCounterSettings(s: CounterSettings) {
  const { error } = await (await db())
    .from("store_settings")
    .update({
      counter_drawer: s.drawer,
      counter_methods: s.methods,
      counter_cash_method: s.cashMethod,
      counter_discounts: s.discounts,
      counter_max_discount: s.maxDiscount,
      counter_price_change: s.priceChange,
      counter_negative_stock: s.negativeStock,
      counter_auto_print: s.autoPrint,
      counter_receipt_size: s.receiptSize,
      counter_receipt_header: s.receiptHeader,
      counter_receipt_footer: s.receiptFooter,
      counter_receipt_gstin: s.receiptGstin,
      counter_float: s.float,
      counter_walkin_name: s.walkinName,
    })
    .eq("id", 1);
  if (error) throw error;
}

// the ways to pay at the till: its own list, else the shop's
export const tillMethods = (c: CounterSettings, shop: string[]) => (c.methods.length ? c.methods : shop);

export type SaleLine = { variant: string; qty: number; price?: number };
export type SalePay = { method: string; amount: number; reference?: string };
export async function ringUp(sale: {
  lines: SaleLine[];
  payments: SalePay[];
  customer?: string | null;
  contact?: { name?: string; phone?: string };
  gstin?: string;
  notes?: string;
  key: string;
}): Promise<{ id: string; number: string; change: number }> {
  const { data, error } = await (await db()).rpc("counter_sale", {
    p_lines: sale.lines,
    p_payments: sale.payments,
    p_customer: sale.customer ?? null,
    p_contact: sale.contact ?? {},
    p_gstin: sale.gstin ?? "",
    p_notes: sale.notes ?? "",
    p_key: sale.key,
  });
  if (error) throw error;
  const row = (data as { order_id: string; order_number: string; change: number }[])[0];
  return { id: row.order_id, number: row.order_number, change: toNumber(row.change) };
}

// ---------------------------------------------------------------- the drawer
export type DrawerSession = { id: string; opened_at: string; opening_float: number; opened_by: string | null; closed_at: string | null; counted_cash: number | null; expected_cash: number | null; note: string };
export type DrawerTotals = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  cash_in: number;
  cash_out: number;
  sales: number;
  sales_total: number;
  by_method: Record<string, number>;
  cash_sales: number;
  // 0086: sales put on account, credit payments collected (by way of paying)
  on_account: number;
  collected: Record<string, number>;
  cash_collected: number;
  refunds: number;
  cash_refunds: number;
  expected_cash: number;
  counted_cash: number | null;
  note: string;
};
export type CashMove = { id: string; kind: "in" | "out"; amount: number; reason: string; created_at: string };

const toSession = (r: Record<string, unknown>): DrawerSession => ({
  id: String(r.id),
  opened_at: String(r.opened_at),
  opening_float: toNumber(r.opening_float),
  opened_by: (r.opened_by as string | null) ?? null,
  closed_at: (r.closed_at as string | null) ?? null,
  counted_cash: r.counted_cash == null ? null : toNumber(r.counted_cash),
  expected_cash: r.expected_cash == null ? null : toNumber(r.expected_cash),
  note: String(r.note ?? ""),
});
const toTotals = (t: Record<string, unknown>): DrawerTotals => {
  const by = (t.by_method ?? {}) as Record<string, unknown>;
  return {
    id: String(t.id),
    opened_at: String(t.opened_at),
    closed_at: (t.closed_at as string | null) ?? null,
    opening_float: toNumber(t.opening_float),
    cash_in: toNumber(t.cash_in),
    cash_out: toNumber(t.cash_out),
    sales: toNumber(t.sales),
    sales_total: toNumber(t.sales_total),
    by_method: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, toNumber(v)])),
    cash_sales: toNumber(t.cash_sales),
    on_account: toNumber(t.on_account ?? 0),
    collected: Object.fromEntries(Object.entries((t.collected ?? {}) as Record<string, unknown>).map(([k, v]) => [k, toNumber(v)])),
    cash_collected: toNumber(t.cash_collected ?? 0),
    refunds: toNumber(t.refunds),
    cash_refunds: toNumber(t.cash_refunds),
    expected_cash: toNumber(t.expected_cash),
    counted_cash: t.counted_cash == null ? null : toNumber(t.counted_cash),
    note: String(t.note ?? ""),
  };
};

export async function openSession(): Promise<DrawerSession | null> {
  const { data, error } = await (await db()).from("counter_sessions").select("*").is("closed_at", null).maybeSingle();
  if (error) throw error;
  return data ? toSession(data) : null;
}
export async function recentSessions(limit = 20): Promise<DrawerSession[]> {
  const { data, error } = await (await db()).from("counter_sessions").select("*").order("opened_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSession);
}
export async function openDrawer(float: number): Promise<string> {
  const { data, error } = await (await db()).rpc("counter_open", { p_float: float });
  if (error) throw error;
  return String(data);
}
export async function moveCash(kind: "in" | "out", amount: number, reason: string) {
  const { error } = await (await db()).rpc("counter_cash", { p_kind: kind, p_amount: amount, p_reason: reason });
  if (error) throw error;
}
export async function drawerTotals(session: string): Promise<DrawerTotals> {
  const { data, error } = await (await db()).rpc("counter_totals", { p_session: session });
  if (error) throw error;
  return toTotals(data as Record<string, unknown>);
}
export async function closeDrawer(counted: number, note: string): Promise<DrawerTotals> {
  const { data, error } = await (await db()).rpc("counter_close", { p_counted: counted, p_note: note });
  if (error) throw error;
  return toTotals(data as Record<string, unknown>);
}
export async function cashMoves(session: string): Promise<CashMove[]> {
  const { data, error } = await (await db()).from("counter_cash_moves").select("id, kind, amount, reason, created_at").eq("session_id", session).order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, kind: m.kind, amount: toNumber(m.amount), reason: m.reason, created_at: m.created_at }));
}

// ---------------------------------------------------------------- sales
export type CounterSale = {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total: number;
  contact_name: string;
  invoice_number: string | null;
  counter_change: number;
  payments: { method: string; amount: number }[];
  items: number;
};
// the counter's sales, newest first: today's by default
export async function counterSales(sinceIso: string, limit = 200): Promise<CounterSale[]> {
  const { data, error } = await (await db())
    .from("orders")
    .select("id, order_number, created_at, status, total, contact_name, invoice_number, counter_change, payments(method, amount, status), order_items(quantity)")
    .eq("channel", "counter")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    created_at: o.created_at,
    status: o.status,
    total: toNumber(o.total),
    contact_name: o.contact_name,
    invoice_number: o.invoice_number,
    counter_change: toNumber(o.counter_change),
    payments: ((o.payments ?? []) as { method: string; amount: unknown; status: string }[]).filter((p) => p.status === "captured").map((p) => ({ method: p.method, amount: toNumber(p.amount) })),
    items: ((o.order_items ?? []) as { quantity: number }[]).reduce((n, i) => n + i.quantity, 0),
  }));
}

// one sale for its receipt
export type ReceiptOrder = {
  id: string;
  order_number: string;
  created_at: string;
  contact_name: string;
  contact_phone: string;
  buyer_gstin: string;
  invoice_number: string | null;
  gst_inclusive: boolean;
  subtotal: number;
  tax: number;
  cess: number;
  total: number;
  counter_tendered: number | null;
  counter_change: number;
  channel: string;
  items: { name: string; label: string; qty: number; price: number; rate: number }[];
  payments: { method: string; amount: number; reference: string }[];
};
export async function receiptOrder(id: string): Promise<ReceiptOrder> {
  const { data, error } = await (await db())
    .from("orders")
    .select("id, order_number, created_at, contact_name, contact_phone, buyer_gstin, invoice_number, gst_inclusive, gst_rate, subtotal, tax, cess, total, counter_tendered, counter_change, channel, order_items(product_name, variant_label, quantity, unit_price, gst_rate), payments(method, amount, reference, status)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const o = data as Record<string, unknown>;
  const rate = toNumber(o.gst_rate);
  return {
    id: String(o.id),
    order_number: String(o.order_number),
    created_at: String(o.created_at),
    contact_name: String(o.contact_name ?? ""),
    contact_phone: String(o.contact_phone ?? ""),
    buyer_gstin: String(o.buyer_gstin ?? ""),
    invoice_number: (o.invoice_number as string | null) ?? null,
    gst_inclusive: !!o.gst_inclusive,
    subtotal: toNumber(o.subtotal),
    tax: toNumber(o.tax),
    cess: toNumber(o.cess),
    total: toNumber(o.total),
    counter_tendered: o.counter_tendered == null ? null : toNumber(o.counter_tendered),
    counter_change: toNumber(o.counter_change),
    channel: String(o.channel ?? "online"),
    items: ((o.order_items ?? []) as Record<string, unknown>[]).map((i) => ({
      name: String(i.product_name),
      label: String(i.variant_label ?? ""),
      qty: toNumber(i.quantity),
      price: toNumber(i.unit_price),
      rate: i.gst_rate == null ? rate : toNumber(i.gst_rate),
    })),
    payments: ((o.payments ?? []) as Record<string, unknown>[])
      .filter((p) => p.status === "captured")
      .map((p) => ({ method: String(p.method), amount: toNumber(p.amount), reference: String(p.reference ?? "") })),
  };
}

// a key per sale, so a double tap or a retry can't ring it up twice
export const saleKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// what each option cost to buy (0015), for the till's "below cost" warning;
// empty when it can't be read
export async function variantCosts(): Promise<Map<string, number>> {
  const { data, error } = await (await db()).from("variant_costs").select("variant_id, cost");
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [String(r.variant_id), toNumber(r.cost)]));
}

// ---------------------------------------------------------------- part two (0086)
// Before 0086 is applied these come back null (or throw a "needs 0086" error),
// and the till hides what needs them.
export const NEEDS_0086 = "This needs database update 0086 (till refunds, credit and reports).";
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42703" || /does not exist|Could not find the function/i.test(e.message ?? ""));
const or0086 = (e: { code?: string; message?: string }) => (missing(e) ? new Error(NEEDS_0086) : e);

// sales on account: allowed, and the shop's default credit limit (null: none)
export type CreditRules = { credit: boolean; creditLimit: number | null };
export async function getCreditRules(): Promise<CreditRules | null> {
  const { data, error } = await (await db()).from("store_settings").select("counter_credit, counter_credit_limit").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return { credit: !!data.counter_credit, creditLimit: data.counter_credit_limit == null ? null : toNumber(data.counter_credit_limit) };
}
export async function saveCreditRules(r: CreditRules) {
  const { error } = await (await db()).from("store_settings").update({ counter_credit: r.credit, counter_credit_limit: r.creditLimit }).eq("id", 1);
  if (error) throw or0086(error);
}
// what a customer owes on sales on account; null before 0086
export async function customerBalance(id: string): Promise<number | null> {
  const { data, error } = await (await db()).rpc("customer_balance", { p_customer: id });
  if (error) return null;
  return toNumber(data);
}
export async function creditLimitOf(id: string): Promise<number | null | undefined> {
  const { data, error } = await (await db()).from("profiles").select("credit_limit").eq("id", id).maybeSingle();
  if (error) return undefined;
  return data?.credit_limit == null ? null : toNumber(data.credit_limit);
}
export async function setCreditLimit(id: string, limit: number | null) {
  const { error } = await (await db()).rpc("counter_set_credit_limit", { p_customer: id, p_limit: limit });
  if (error) throw or0086(error);
}
export type Balance = { profile_id: string; name: string; phone: string; balance: number; sales: number; oldest: string; credit_limit: number | null };
export async function balances(): Promise<Balance[]> {
  const { data, error } = await (await db()).rpc("counter_balances");
  if (error) throw or0086(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    profile_id: String(r.profile_id),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    balance: toNumber(r.balance),
    sales: toNumber(r.sales),
    oldest: String(r.oldest),
    credit_limit: r.credit_limit == null ? null : toNumber(r.credit_limit),
  }));
}
export async function collect(customer: string, amount: number, method: string, reference: string): Promise<string> {
  const { data, error } = await (await db()).rpc("counter_collect", { p_customer: customer, p_amount: amount, p_method: method, p_reference: reference });
  if (error) throw or0086(error);
  return String(data);
}

// a sale found by its number, receipt or invoice, to refund at the till
export type RefundableSale = {
  id: string;
  order_number: string;
  invoice_number: string | null;
  created_at: string;
  status: string;
  channel: string;
  contact_name: string;
  total: number;
  paid_total: number | null;
  refunded: number;
  on_account: boolean;
  owed: number;
  lines: { id: string; name: string; label: string; qty: number; price: number; refunded: number }[];
};
export async function findSale(text: string): Promise<RefundableSale | null> {
  const t = text.trim().toUpperCase();
  if (!t) return null;
  const sel = "id, order_number, invoice_number, created_at, status, channel, contact_name, total, paid_total, counter_on_account, order_items(id, product_name, variant_label, quantity, unit_price), order_refunds(amount, order_refund_items(order_item_id, quantity))";
  const sb = await db();
  let res = await sb.from("orders").select(sel).or(`order_number.eq.${t},invoice_number.eq.${t}`).limit(1).maybeSingle();
  if (res.error && missing(res.error)) res = await sb.from("orders").select(sel.replace(", counter_on_account", "")).or(`order_number.eq.${t},invoice_number.eq.${t}`).limit(1).maybeSingle();
  if (res.error) throw res.error;
  if (!res.data) return null;
  return saleOf(res.data as unknown as Record<string, unknown>);
}
export async function saleById(id: string): Promise<RefundableSale> {
  const sel = "id, order_number, invoice_number, created_at, status, channel, contact_name, total, paid_total, counter_on_account, order_items(id, product_name, variant_label, quantity, unit_price), order_refunds(amount, order_refund_items(order_item_id, quantity))";
  const { data, error } = await (await db()).from("orders").select(sel).eq("id", id).single();
  if (error) throw error;
  return saleOf(data as unknown as Record<string, unknown>);
}
async function saleOf(o: Record<string, unknown>): Promise<RefundableSale> {
  const refunds = (o.order_refunds ?? []) as { amount: unknown; order_refund_items?: { order_item_id: string; quantity: number }[] }[];
  const back = new Map<string, number>();
  for (const r of refunds) for (const i of r.order_refund_items ?? []) back.set(i.order_item_id, (back.get(i.order_item_id) ?? 0) + i.quantity);
  let owed = 0;
  if (o.counter_on_account) {
    const { data } = await (await db()).rpc("counter_owed", { p_order: o.id });
    owed = toNumber(data ?? 0);
  }
  return {
    id: String(o.id),
    order_number: String(o.order_number),
    invoice_number: (o.invoice_number as string | null) ?? null,
    created_at: String(o.created_at),
    status: String(o.status),
    channel: String(o.channel ?? "online"),
    contact_name: String(o.contact_name ?? ""),
    total: toNumber(o.total),
    paid_total: o.paid_total == null ? null : toNumber(o.paid_total),
    refunded: refunds.reduce((n, r) => n + toNumber(r.amount), 0),
    on_account: !!o.counter_on_account,
    owed,
    lines: ((o.order_items ?? []) as Record<string, unknown>[]).map((i) => ({
      id: String(i.id),
      name: String(i.product_name),
      label: String(i.variant_label ?? ""),
      qty: toNumber(i.quantity),
      price: toNumber(i.unit_price),
      refunded: back.get(String(i.id)) ?? 0,
    })),
  };
}
export async function refundAtTill(r: { order: string; lines: { item: string; qty: number }[]; amount: number; method: string; restock: boolean; reason: string }): Promise<string> {
  const { data, error } = await (await db()).rpc("counter_refund", { p_order: r.order, p_lines: r.lines, p_amount: r.amount, p_method: r.method, p_restock: r.restock, p_reason: r.reason });
  if (error) throw or0086(error);
  return String(data);
}

// lines taken off a ticket before payment, for the Voided items report;
// quietly skipped before 0086
export async function recordVoid(kind: "line" | "order", lines: { variant: string; name: string; qty: number; value: number }[], reason = "") {
  if (!lines.length) return;
  try {
    await (await db()).rpc("counter_void", { p_kind: kind, p_lines: lines, p_reason: reason });
  } catch {}
}

// ---------------------------------------------------------------- receipts for refunds and credit payments
export type RefundSlip = {
  id: string;
  created_at: string;
  amount: number;
  reason: string;
  restocked: boolean;
  method: string;
  order_id: string;
  order_number: string;
  invoice_number: string | null;
  contact_name: string;
  credit_note: string | null;
  lines: { name: string; label: string; qty: number; price: number }[];
};
export async function refundSlip(id: string): Promise<RefundSlip> {
  const sb = await db();
  const { data, error } = await sb
    .from("order_refunds")
    .select("id, created_at, amount, reason, restocked, order_id, orders(order_number, invoice_number, contact_name), order_refund_items(quantity, order_items(product_name, variant_label, unit_price))")
    .eq("id", id)
    .single();
  if (error) throw error;
  const [pay, note] = await Promise.all([sb.from("counter_refund_pays").select("method").eq("refund_id", id).maybeSingle(), sb.from("credit_notes").select("number").eq("refund_id", id).maybeSingle()]);
  const r = data as unknown as Record<string, unknown>;
  const o = (r.orders ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    created_at: String(r.created_at),
    amount: toNumber(r.amount),
    reason: String(r.reason ?? ""),
    restocked: !!r.restocked,
    method: pay.data?.method ?? "",
    order_id: String(r.order_id),
    order_number: String(o.order_number ?? ""),
    invoice_number: (o.invoice_number as string | null) ?? null,
    contact_name: String(o.contact_name ?? ""),
    credit_note: note.data?.number ?? null,
    lines: ((r.order_refund_items ?? []) as Record<string, unknown>[]).map((x) => {
      const i = (x.order_items ?? {}) as Record<string, unknown>;
      return { name: String(i.product_name ?? ""), label: String(i.variant_label ?? ""), qty: toNumber(x.quantity), price: toNumber(i.unit_price) };
    }),
  };
}
export type CreditSlip = { id: string; created_at: string; amount: number; method: string; reference: string; balance_after: number; name: string; phone: string; allocations: { order_number: string; amount: number }[] };
export async function creditSlip(id: string): Promise<CreditSlip> {
  const { data, error } = await (await db()).from("counter_credit_payments").select("id, created_at, amount, method, reference, balance_after, allocations, profiles!counter_credit_payments_profile_id_fkey(full_name, phone)").eq("id", id).single();
  if (error) throw or0086(error);
  const r = data as unknown as Record<string, unknown>;
  const p = (r.profiles ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    created_at: String(r.created_at),
    amount: toNumber(r.amount),
    method: String(r.method),
    reference: String(r.reference ?? ""),
    balance_after: toNumber(r.balance_after),
    name: String(p.full_name ?? ""),
    phone: String(p.phone ?? ""),
    allocations: ((r.allocations ?? []) as Record<string, unknown>[]).map((a) => ({ order_number: String(a.order_number), amount: toNumber(a.amount) })),
  };
}

// ---------------------------------------------------------------- the till's reports
export type TillReportKind =
  | "daily"
  | "hourly"
  | "hourly_groups"
  | "pay_types"
  | "pay_users"
  | "pay_customers"
  | "users"
  | "items"
  | "till_refunds"
  | "unpaid"
  | "collected"
  | "floats"
  | "cash_moves"
  | "voids"
  | "discounts"
  | "item_discounts";
export async function tillReport(kind: TillReportKind, from: string, to: string, channel: "all" | "online" | "counter" = "all", cashier: string | null = null): Promise<Record<string, string | number | boolean | null>[]> {
  const { data, error } = await (await db()).rpc("admin_till_report", { p_kind: kind, p_from: from, p_to: to, p_channel: channel, p_cashier: cashier });
  if (error) throw or0086(error);
  return (data ?? []) as Record<string, string | number | boolean | null>[];
}
export async function cashiers(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await (await db()).rpc("admin_cashiers");
  if (error) return [];
  return (data ?? []) as { id: string; name: string }[];
}
