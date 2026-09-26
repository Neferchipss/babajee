// Admin reads and writes for the catalogue. Every call runs with the
// signed-in browser session, so the real gate is row-level security: only an
// account with role = 'admin' can see a hidden row or write anything here —
// see supabase/migrations/0003_catalogue.sql. A customer session gets an
// empty read and a rejected write no matter what this code does.
import { toNumber } from "./currency";
import { getSupabase } from "./supabase";

export type AdminCategory = { id: string; slug: string; name: string; sort_order: number; is_visible: boolean };
export type AdminVariant = {
  id: string;
  label: string;
  price: number;
  stock_qty: number;
  is_visible: boolean;
  sort_order: number;
};
export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_visible: boolean;
  sort_order: number;
  category_id: string;
  category_slug?: string;
  category_name?: string;
  variants: AdminVariant[];
};

function db() {
  const sb = getSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb;
}

function toVariant(row: {
  id: string;
  label: string;
  price: unknown;
  stock_qty: unknown;
  is_visible: boolean;
  sort_order: number;
}): AdminVariant {
  return { ...row, price: toNumber(row.price), stock_qty: toNumber(row.stock_qty) };
}

export async function listCategories(): Promise<AdminCategory[]> {
  const { data, error } = await db()
    .from("categories")
    .select("id, slug, name, sort_order, is_visible")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(input: { slug: string; name: string; sort_order: number }) {
  const { error } = await db().from("categories").insert(input);
  if (error) throw error;
}

export async function updateCategory(id: string, patch: Partial<Pick<AdminCategory, "name" | "sort_order" | "is_visible">>) {
  const { error } = await db().from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function listCategoriesWithCounts(): Promise<(AdminCategory & { count: number })[]> {
  const [cats, { data: prods, error }] = await Promise.all([listCategories(), db().from("products").select("category_id")]);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const p of prods ?? []) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  return cats.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
}

// Swap this category with its neighbour above/below in the list order.
export async function moveCategory(rows: AdminCategory[], id: string, direction: -1 | 1) {
  const i = rows.findIndex((r) => r.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= rows.length) return;
  const a = rows[i];
  const b = rows[j];
  await Promise.all([updateCategory(a.id, { sort_order: b.sort_order }), updateCategory(b.id, { sort_order: a.sort_order })]);
}

const PRODUCT_SELECT =
  "id, slug, name, description, is_visible, sort_order, category_id, categories(slug, name), product_variants(id, label, price, stock_qty, is_visible, sort_order)";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_visible: boolean;
  sort_order: number;
  category_id: string;
  categories: { slug: string; name: string } | { slug: string; name: string }[] | null;
  product_variants: AdminVariant[] | null;
};

function toProduct(row: ProductRow): AdminProduct {
  const cat = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    is_visible: row.is_visible,
    sort_order: row.sort_order,
    category_id: row.category_id,
    category_slug: cat?.slug,
    category_name: cat?.name,
    variants: (row.product_variants ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toVariant),
  };
}

export async function listProducts(categoryId?: string): Promise<AdminProduct[]> {
  let query = db().from("products").select(PRODUCT_SELECT).order("sort_order");
  if (categoryId) query = query.eq("category_id", categoryId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as ProductRow[]).map(toProduct);
}

export async function getProduct(id: string): Promise<AdminProduct | null> {
  const { data, error } = await db().from("products").select(PRODUCT_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toProduct(data as unknown as ProductRow) : null;
}

export async function createProduct(input: { category_id: string; slug: string; name: string; description: string }) {
  const { data, error } = await db().from("products").insert(input).select("id").single();
  if (error) throw error;
  const { error: variantError } = await db()
    .from("product_variants")
    .insert({ product_id: data.id, label: "Default", price: 0, stock_qty: 0, is_visible: false, sort_order: 0 });
  if (variantError) throw variantError;
  return data.id as string;
}

export async function updateProduct(
  id: string,
  patch: Partial<Pick<AdminProduct, "name" | "description" | "is_visible" | "category_id" | "sort_order">>,
) {
  const { error } = await db().from("products").update(patch).eq("id", id);
  if (error) throw error;
}

// Most products have exactly one option ("Default"). Keeping product
// visibility and that one option's visibility as two separate switches is
// exactly the trap that leaves a product showing with nothing sellable on
// it (it happened on the real catalogue) — so for a single-option product,
// showing or hiding the product always carries its one option with it.
// A product with real choices (colour, size, ...) still needs each option
// set individually on its edit page, since those genuinely differ.
export async function setProductVisibility(product: AdminProduct, visible: boolean) {
  await updateProduct(product.id, { is_visible: visible });
  if (product.variants.length === 1) {
    await upsertVariant(product.id, { ...product.variants[0], is_visible: visible });
  }
}

export async function bulkSetVisibility(products: AdminProduct[], ids: string[], visible: boolean) {
  if (ids.length === 0) return;
  await bulkSetProductVisibility(ids, visible);
  const singles = products.filter((p) => ids.includes(p.id) && p.variants.length === 1);
  await Promise.all(singles.map((p) => upsertVariant(p.id, { ...p.variants[0], is_visible: visible })));
}

export async function bulkSetProductVisibility(ids: string[], visible: boolean) {
  if (ids.length === 0) return;
  const { error } = await db().from("products").update({ is_visible: visible }).in("id", ids);
  if (error) throw error;
}

export async function upsertVariant(productId: string, variant: Partial<AdminVariant> & { id?: string }) {
  if (variant.id) {
    const { id, ...patch } = variant;
    const { error } = await db().from("product_variants").update(patch).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await db()
      .from("product_variants")
      .insert({
        product_id: productId,
        label: variant.label ?? "Option",
        price: variant.price ?? 0,
        stock_qty: variant.stock_qty ?? 0,
        is_visible: variant.is_visible ?? false,
        sort_order: variant.sort_order ?? 0,
      });
    if (error) throw error;
  }
}

export async function deleteVariant(id: string) {
  const { error } = await db().from("product_variants").delete().eq("id", id);
  if (error) throw error;
}
