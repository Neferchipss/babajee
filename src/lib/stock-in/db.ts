import { getSupabase } from "../supabase";
import type { Candidate } from "./match";

// Stock in: suppliers, bills and purchase GST (migration 0050). Admins only.
export type Supplier = { id: string; name: string; gstin: string; phone: string; notes: string; active: boolean; created_at: string };

export type ReceiptKind = "bill" | "opening" | "quick";
export type ReceiptStatus = "posted" | "void";

export type ReceiptRow = {
  id: string;
  kind: ReceiptKind;
  status: ReceiptStatus;
  supplier_id: string | null;
  supplier: string | null;
  bill_no: string;
  bill_date: string;
  lines: number;
  qty: number;
  taxable: number;
  gst: number;
};

export type ReceiptLine = {
  id: string;
  variant_id: string;
  product: string;
  option: string;
  qty: number;
  unit_price: number;
  gst_rate: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  claimable: boolean;
};

export type Receipt = {
  id: string;
  kind: ReceiptKind;
  status: ReceiptStatus;
  supplier_id: string | null;
  supplier: string | null;
  supplier_gstin: string | null;
  bill_no: string;
  bill_date: string;
  notes: string;
  created_at: string;
  voided_at: string | null;
  lines: ReceiptLine[];
};

export type PurchaseGstMonth = {
  month: string; // YYYY-MM
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  claimable_gst: number;
};

export type PostReceiptInput = {
  kind: ReceiptKind;
  supplier_id?: string | null;
  bill_no?: string;
  bill_date?: string;
  notes?: string;
  lines: { variant_id: string; qty: number; unit_price: number; gst_rate: number }[];
};

function db() {
  const sb = getSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await db().rpc("admin_suppliers");
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

// Adds a supplier, or updates it when s.id is set. Returns the supplier id.
export async function saveSupplier(s: Partial<Supplier>): Promise<string> {
  const { data, error } = await db().rpc("admin_save_supplier", { p: s });
  if (error) throw error;
  return data as string;
}

// Returns the receipt id. Posting a bill whose supplier and number are already
// posted adds the lines to that bill.
export async function postReceipt(input: PostReceiptInput): Promise<string> {
  const { data, error } = await db().rpc("admin_post_receipt", {
    p_kind: input.kind,
    p_supplier: input.supplier_id ?? null,
    p_bill_no: input.bill_no ?? "",
    p_bill_date: input.bill_date ?? null,
    p_notes: input.notes ?? "",
    p_lines: input.lines,
  });
  if (error) throw error;
  return data as string;
}

export async function voidReceipt(id: string) {
  const { error } = await db().rpc("admin_void_receipt", { p_receipt: id });
  if (error) throw error;
}

export async function correctStock(variant_id: string, count: number, note: string) {
  const { error } = await db().rpc("admin_correct_stock", { p_variant: variant_id, p_count: count, p_note: note });
  if (error) throw error;
}

// from / to are bill dates (YYYY-MM-DD); null leaves that end open.
export async function listReceipts(from: string | null, to: string | null): Promise<ReceiptRow[]> {
  const { data, error } = await db().rpc("admin_receipts", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as ReceiptRow[];
}

export async function getReceipt(id: string): Promise<Receipt> {
  const { data, error } = await db().rpc("admin_receipt", { p_id: id });
  if (error) throw error;
  if (!data) throw new Error("Receipt not found.");
  return data as Receipt;
}

// How many options are not counting stock yet.
export async function uncounted(): Promise<number> {
  const { data, error } = await db().rpc("admin_uncounted");
  if (error) throw error;
  return (data ?? 0) as number;
}

// Switches counting on for every option, starting each from 0 (an old count
// that wasn't 0 is logged as a correction); returns how many it changed.
export async function trackAllStock(): Promise<number> {
  const { data, error } = await db().rpc("admin_track_all_stock");
  if (error) throw error;
  return (data ?? 0) as number;
}

export async function purchaseGst(from: string, to: string): Promise<PurchaseGstMonth[]> {
  const { data, error } = await db().rpc("admin_purchase_gst", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as PurchaseGstMonth[];
}

// Bill numbers by receipt id, for labelling stock movements.
export async function billNumbers(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from("stock_receipts").select("id, bill_no").in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; bill_no: string }[]).map((r) => [r.id, r.bill_no]));
}

// Every option, for matching bill lines to the shop's products.
export async function stockCatalogue(): Promise<Candidate[]> {
  type Row = { id: string; label: string | null; sku: string | null; products: { name: string } | { name: string }[] | null };
  // PostgREST caps a response at max_rows (1000 by default), so read in pages
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("product_variants").select("id, label, sku, products(name)").order("id").range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows.map((r) => {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    return {
      variant_id: r.id,
      product: p?.name ?? "",
      option: !r.label || r.label === "Default" ? "" : r.label,
      sku: r.sku || null,
    };
  });
}

// Input tax credit per month (0051): GST on claimable bills, and the part
// that can be claimed now because the bill is ticked as in GSTR-2B.
export type ItcMonth = { month: string; on_bills: number; in_2b: number | null; cgst: number | null; sgst: number | null; igst: number | null; not_in_2b_bills: number };
export async function itc(from: string, to: string): Promise<ItcMonth[]> {
  const { data, error } = await db().rpc("admin_itc", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as ItcMonth[];
}

// supplier bills still unpaid 180 days after their date: their credit must be reversed
export type UnpaidBill = { id: string; bill_no: string; bill_date: string; supplier: string | null; days: number; gst: number | null };
export async function unpaidBills(days = 180): Promise<UnpaidBill[]> {
  const { data, error } = await db().rpc("admin_unpaid_bills", { p_days: days });
  if (error) throw error;
  return (data ?? []) as UnpaidBill[];
}

// the two ticks on a supplier bill
export async function getReceiptFlags(id: string): Promise<{ in_2b: boolean; paid_on: string | null }> {
  const { data, error } = await db().from("stock_receipts").select("in_2b, paid_on").eq("id", id).maybeSingle();
  if (error) throw error;
  return { in_2b: !!data?.in_2b, paid_on: (data?.paid_on as string | null) ?? null };
}
export async function setReceiptFlags(id: string, in2b: boolean, paidOn: string | null) {
  const { error } = await db().rpc("admin_set_receipt_flags", { p_receipt: id, p_in_2b: in2b, p_paid_on: paidOn });
  if (error) throw error;
}
