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

export async function listReceipts(from: string, to: string): Promise<ReceiptRow[]> {
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

// Switches counting on for every option; returns how many it changed.
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
