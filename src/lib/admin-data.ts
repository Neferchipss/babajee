// Admin reads and writes for the catalogue. Every call runs with the
// signed-in browser session, so the real gate is row-level security: only an
// account with role = 'admin' can see a hidden row or write anything here —
// see supabase/migrations/0003_catalogue.sql. A customer session gets an
// empty read and a rejected write no matter what this code does.
import { toNumber } from "./currency";
import { getSupabase } from "./supabase";

export type AdminCategory = { id: string; slug: string; name: string; sort_order: number; is_visible: boolean; tagline?: string | null };
export type AdminVariant = {
  id: string;
  label: string;
  price: number;
  stock_qty: number;
  // on: checkout refuses more than stock_qty and counts it down (supabase/migrations/0013)
  track_stock: boolean;
  is_visible: boolean;
  sort_order: number;
  // codes and the "was" price (0028); empty is null
  sku: string | null;
  barcode: string | null;
  compare_at: number | null;
};
// A photo uploaded from the admin, in the product-photos bucket
// (supabase/migrations/0012_product_photo_storage.sql). variant_id ties it to
// one option (a colour, a design); none means it shows the product as a whole.
export type AdminImage = {
  id: string;
  storage_path: string;
  url: string;
  variant_id: string | null;
  sort_order: number;
  // for a photo brought in from the shoot (public/products/...), the shoot file
  // it came from, so the shoot's copy is not offered again
  alt_text: string;
};
export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  // what Shopify calls vendor, product type and tags (0022)
  brand: string;
  product_type: string;
  tags: string[];
  // its search-engine listing; empty means made automatically (0026, lib/seo.ts)
  seo_title: string;
  seo_description: string;
  // its GST bracket (0, 5, 12, 18, 28 or 40); null = the shop's default rate.
  // HSN code for the invoice, may be empty (0030)
  gst_rate: number | null;
  hsn: string;
  is_visible: boolean;
  // draft, on the shop, or archived (0041); is_visible follows it
  status: ProductStatus;
  // a label within its category, a filter chip on the shelf (0041)
  subcategory: string;
  // rows of the product page's specifications table (0041)
  specs: Spec[];
  // its own low-stock mark, or null for the shop's (0043)
  low_stock_at: number | null;
  sort_order: number;
  category_id: string;
  category_slug?: string;
  category_name?: string;
  variants: AdminVariant[];
  images: AdminImage[];
};

export type ProductStatus = "draft" | "published" | "archived";
export type Spec = { label: string; value: string };

export const PHOTO_BUCKET = "product-photos";

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
  track_stock?: boolean;
  is_visible: boolean;
  sort_order: number;
  sku?: string | null;
  barcode?: string | null;
  compare_at?: unknown;
}): AdminVariant {
  return {
    ...row,
    price: toNumber(row.price),
    stock_qty: toNumber(row.stock_qty),
    track_stock: row.track_stock ?? false,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    compare_at: row.compare_at == null ? null : toNumber(row.compare_at),
  };
}

export async function listCategories(): Promise<AdminCategory[]> {
  const { data, error } = await db()
    .from("categories")
    .select("id, slug, name, sort_order, is_visible, tagline")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(input: { slug: string; name: string; sort_order: number }) {
  const { error } = await db().from("categories").insert(input);
  if (error) throw error;
}

export async function updateCategory(id: string, patch: Partial<Pick<AdminCategory, "name" | "sort_order" | "is_visible" | "tagline">>) {
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
  "id, slug, name, description, brand, product_type, tags, seo_title, seo_description, gst_rate, hsn, is_visible, status, subcategory, specs, low_stock_at, sort_order, category_id, categories(slug, name), product_variants(id, label, price, stock_qty, track_stock, is_visible, sort_order, sku, barcode, compare_at), product_images(id, storage_path, variant_id, sort_order, alt_text)";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  product_type: string | null;
  tags: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  gst_rate: number | string | null;
  hsn: string | null;
  is_visible: boolean;
  status?: ProductStatus | null;
  subcategory?: string | null;
  specs?: Spec[] | null;
  low_stock_at?: number | null;
  sort_order: number;
  category_id: string;
  categories: { slug: string; name: string } | { slug: string; name: string }[] | null;
  product_variants: AdminVariant[] | null;
  product_images: Omit<AdminImage, "url">[] | null;
};

const photoUrl = (path: string) => db().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

function toProduct(row: ProductRow): AdminProduct {
  const cat = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    brand: row.brand ?? "",
    product_type: row.product_type ?? "",
    tags: row.tags ?? [],
    seo_title: row.seo_title ?? "",
    seo_description: row.seo_description ?? "",
    gst_rate: row.gst_rate == null ? null : Number(row.gst_rate),
    hsn: row.hsn ?? "",
    is_visible: row.is_visible,
    status: row.status ?? (row.is_visible ? "published" : "draft"),
    subcategory: row.subcategory ?? "",
    specs: Array.isArray(row.specs) ? row.specs : [],
    low_stock_at: row.low_stock_at ?? null,
    sort_order: row.sort_order,
    category_id: row.category_id,
    category_slug: cat?.slug,
    category_name: cat?.name,
    variants: (row.product_variants ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toVariant),
    images: (row.product_images ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ ...i, url: photoUrl(i.storage_path) })),
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
  const { data, error } = await db().from("products").insert({ ...input, is_visible: true }).select("id").single();
  if (error) throw error;
  const { error: variantError } = await db()
    .from("product_variants")
    .insert({ product_id: data.id, label: "Default", price: 0, stock_qty: 0, is_visible: true, sort_order: 0 });
  if (variantError) throw variantError;
  return data.id as string;
}

export async function updateProduct(
  id: string,
  patch: Partial<Pick<AdminProduct, "name" | "description" | "brand" | "product_type" | "tags" | "seo_title" | "seo_description" | "gst_rate" | "hsn" | "is_visible" | "status" | "subcategory" | "specs" | "low_stock_at" | "category_id" | "sort_order">>,
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

// Draft, on the shop, or archived; a single-option product's one option
// follows, as with setProductVisibility above.
export async function setProductStatus(product: AdminProduct, status: ProductStatus) {
  await updateProduct(product.id, { status });
  if (product.variants.length === 1) {
    await upsertVariant(product.id, { ...product.variants[0], is_visible: status === "published" });
  }
}

// the subcategories already used in a category, most used first
export async function subcategoriesOf(categoryId: string): Promise<string[]> {
  const { data, error } = await db().from("products").select("subcategory").eq("category_id", categoryId).neq("subcategory", "");
  if (error) throw error;
  const n = new Map<string, number>();
  for (const r of (data ?? []) as { subcategory: string }[]) n.set(r.subcategory, (n.get(r.subcategory) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([s]) => s);
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

// a SKU that's already on another option: say so plainly
const skuTaken = (e: { code?: string; message?: string }) =>
  e.code === "23505" && /sku/i.test(e.message ?? "") ? new Error("That SKU is already used by another option. Each SKU has to be different.") : e;

export async function upsertVariant(productId: string, variant: Partial<AdminVariant> & { id?: string }) {
  if (variant.id) {
    const { id, ...patch } = variant;
    const { error } = await db().from("product_variants").update(patch).eq("id", id);
    if (error) throw skuTaken(error);
  } else {
    const { error } = await db()
      .from("product_variants")
      .insert({
        product_id: productId,
        label: variant.label ?? "Option",
        price: variant.price ?? 0,
        stock_qty: variant.stock_qty ?? 0,
        track_stock: variant.track_stock ?? false,
        is_visible: variant.is_visible ?? true,
        sort_order: variant.sort_order ?? 0,
      });
    if (error) throw error;
  }
}

// A product gone for good, with its options and photos. One that has been
// ordered can't go (the orders keep pointing at it): that fails with
// ProductOrdered, and hiding it is the way to take it off the shop.
export class ProductOrdered extends Error {
  constructor(name: string) {
    super(`${name} has been ordered, so it stays for those orders. Hide it instead.`);
    this.name = "ProductOrdered";
  }
}

export async function deleteProduct(product: AdminProduct) {
  const { error } = await db().rpc("admin_delete_product", { p_product: product.id });
  if (error) {
    if (error.message === "product_ordered") throw new ProductOrdered(product.name);
    throw error;
  }
  const paths = product.images.map((i) => i.storage_path).filter((p) => p && p !== "demo");
  if (paths.length) await db().storage.from(PHOTO_BUCKET).remove(paths);
}

export async function deleteVariant(id: string) {
  const { error } = await db().from("product_variants").delete().eq("id", id);
  if (error) throw error;
}

// --- photos ------------------------------------------------------------------

// A photo as the shop wants it: at most 1600 px on its longest side, WebP. A
// phone photo of 4-8 MB comes out at a few hundred KB, and uploads in a moment.
export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.86));
  if (!blob) throw new Error("This picture could not be read. Try a JPG or PNG.");
  return blob;
}

export async function uploadProductImage(productId: string, file: File, sortOrder: number, variantId: string | null = null, altText = ""): Promise<string> {
  const blob = await preparePhoto(file);
  const path = `${productId}/${crypto.randomUUID()}.webp`;
  const up = await db().storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
  if (up.error) throw up.error;
  const { data, error } = await db()
    .from("product_images")
    .insert({ product_id: productId, storage_path: path, variant_id: variantId, sort_order: sortOrder, alt_text: altText })
    .select("id")
    .single();
  if (error) {
    await db().storage.from(PHOTO_BUCKET).remove([path]); // no orphan file
    throw error;
  }
  return data.id as string;
}

// A shoot photo (built into the site) made into one of the product's own, so it
// can be moved, reordered or removed like any other.
export async function importShootPhoto(productId: string, src: string, path: string, sortOrder: number, variantId: string | null) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`The shoot photo ${path} could not be read.`);
  const blob = await res.blob();
  const file = new File([blob], path.split("/").pop() ?? "photo.webp", { type: blob.type || "image/webp" });
  return uploadProductImage(productId, file, sortOrder, variantId, path);
}

export async function deleteProductImage(image: AdminImage) {
  const { error } = await db().from("product_images").delete().eq("id", image.id);
  if (error) throw error;
  await db().storage.from(PHOTO_BUCKET).remove([image.storage_path]);
}

// the photos in this order: the first is the one on the shelf
export async function reorderProductImages(ids: string[]) {
  await Promise.all(
    ids.map(async (id, i) => {
      const { error } = await db().from("product_images").update({ sort_order: i }).eq("id", id);
      if (error) throw error;
    }),
  );
}

export async function setImageVariant(id: string, variantId: string | null) {
  const { error } = await db().from("product_images").update({ variant_id: variantId }).eq("id", id);
  if (error) throw error;
}
