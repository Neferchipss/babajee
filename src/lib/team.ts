import { getSupabase } from "./supabase";

// The shop's admins and the activity log (migration 0042). Admins only.
export type Admin = { id: string; name: string; email: string; last_sign_in: string | null; joined: string; me: boolean };
export type AuditEntry = {
  id: number;
  at: string;
  actor_id: string | null;
  actor_name: string;
  area: string;
  row_id: string;
  label: string;
  action: "added" | "changed" | "removed";
  changes: Record<string, [unknown, unknown]> | null;
};

function db() {
  const sb = getSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb;
}

export async function listAdmins(): Promise<Admin[]> {
  const { data, error } = await db().rpc("admin_team");
  if (error) throw error;
  return (data ?? []) as Admin[];
}

export async function setAdmin(email: string, on: boolean) {
  const { error } = await db().rpc("admin_set_admin", { p_email: email, p_on: on });
  if (error) throw error;
}

export async function auditLog(opts: { areas?: string[]; actor?: string; before?: number; limit?: number } = {}): Promise<AuditEntry[]> {
  const { data, error } = await db().rpc("admin_audit_log", {
    p_area: opts.areas?.length ? opts.areas.join(",") : null,
    p_actor: opts.actor ?? null,
    p_before: opts.before ?? null,
    p_limit: opts.limit ?? 100,
  });
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

// how each part of the shop is named in the log, and grouped in its filter
export const AREAS: { id: string; label: string; tables: string[] }[] = [
  { id: "products", label: "Products", tables: ["products", "product_variants", "product_images", "variant_costs", "product_reviews"] },
  { id: "categories", label: "Categories and collections", tables: ["categories", "collections", "collection_items"] },
  { id: "orders", label: "Orders", tables: ["orders", "order_refunds"] },
  { id: "customers", label: "Customers", tables: ["profiles", "customer_notes", "customer_segments"] },
  { id: "settings", label: "Settings", tables: ["store_settings"] },
];
export const AREA_NAME: Record<string, string> = {
  products: "product",
  product_variants: "option",
  product_images: "photo",
  variant_costs: "buying price",
  product_reviews: "review",
  categories: "category",
  collections: "collection",
  collection_items: "collection item",
  orders: "order",
  order_refunds: "refund",
  profiles: "customer",
  customer_notes: "note",
  customer_segments: "customer group",
  store_settings: "settings",
};

// field names as people say them; anything not here is shown tidied up
const FIELD: Record<string, string> = {
  is_visible: "shown",
  stock_qty: "stock",
  track_stock: "counting stock",
  compare_at: "was price",
  sort_order: "position",
  category_id: "category",
  gst_rate: "GST",
  hsn: "HSN",
  seo_title: "search title",
  seo_description: "search description",
  full_name: "name",
  free_shipping_over: "free delivery over",
  return_days: "return window",
  bank_account_number: "bank account number",
  bank_ifsc: "IFSC",
  bank_upi_id: "UPI ID",
  paid_total: "amount paid",
  delivery_failed_at: "delivery failed",
  delivery_failed_reason: "failure reason",
  purchase: "buying price",
};
export const fieldName = (k: string) => FIELD[k] ?? k.replace(/_/g, " ");

export function showValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : "none";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}
