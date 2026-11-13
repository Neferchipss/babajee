// Server-side reads of the live catalogue (categories, products, variants).
// Used only by the shop pages — cart/checkout/orders still run on the
// placeholder data in catalog-data.ts until that step is built.
//
// This is a plain server-side client (no browser session), so it only ever
// sees what row-level security lets an anonymous visitor see: is_visible
// rows. A hidden product simply does not appear here.
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES, type CatalogProduct } from "./catalog-data";
import { toNumber } from "./currency";
import { photosFor } from "./product-photos";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function client() {
  if (!URL || !KEY) return null;
  // Where the stock sheet can stand in (useLocal, below), an unreachable
  // database should give up at once rather than retry for 1 + 2 + 4 seconds:
  // with the project offline, that wait made every dev page take 7 seconds.
  return createClient(URL, KEY, { auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false }, db: { retry: typeof window === "undefined" && !useLocal } });
}

// Price is unset for local stand-in products (see useLocal below) and for
// database options not priced yet (still ₹0); it then renders as the
// "xx.xx" placeholder.
// compareAt: the higher "was" price, struck through on the card (0028)
export type DbVariant = { id: string; label: string; price?: number; stockQty: number; compareAt?: number };
export type DbCardProduct = {
  slug: string;
  name: string;
  variantCount: number;
  minPrice?: number;
  variants: DbVariant[];
  // how it is packed, e.g. "Box of 50" (from the stock sheet, when known)
  unit?: string;
  // its own search-engine title, when the admin wrote one
  seoTitle?: string;
  // the "was" price of its cheapest option, when that option is marked down
  mrp?: number;
  // its label within the category, a filter chip on the shelf (0041)
  subcategory?: string;
  // for the shelf's Sort & filter: its brand, and when it was added
  brand?: string;
  added?: string;
};
export type DbCategory = { slug: string; name: string };

// In development and on the GitHub Pages preview, when the database gives
// back nothing (paused project, no network), the local stock sheet stands in
// so the shop is still worth looking at. Never in a real production build:
// that must show the real catalogue or nothing. The sheet has no prices, so
// local products carry none.
const useLocal = process.env.NODE_ENV === "development" || process.env.GITHUB_PAGES === "true";

function localVariants(p: CatalogProduct): DbVariant[] {
  const labels = p.variants.length ? p.variants.map((v) => v.label) : ["Standard"];
  return labels.map((label, i) => ({ id: `${p.slug}-${i}`, label, stockQty: 1 }));
}

function localCard(p: CatalogProduct): DbCardProduct {
  const variants = localVariants(p);
  const unit = p.unitsPerBox && p.unitsPerBox > 1 ? `Box of ${p.unitsPerBox}` : undefined;
  return { slug: p.slug, name: p.name, variantCount: variants.length, variants, unit };
}

function localCategoryDetail(slug: string) {
  const c = CATEGORIES.find((x) => x.slug === slug);
  if (!c) return null;
  return { category: { slug: c.slug, name: c.name }, products: c.products.map(localCard) };
}

function localProductDetail(categorySlug: string, productSlug: string) {
  const c = CATEGORIES.find((x) => x.slug === categorySlug);
  const p = c?.products.find((x) => x.slug === productSlug);
  if (!c || !p) return null;
  return {
    category: { slug: c.slug, name: c.name },
    product: { slug: p.slug, name: p.name, description: null as string | null, variants: localVariants(p) },
    more: c.products.filter((x) => x.slug !== productSlug).slice(0, 4).map(localCard),
  };
}

// How many can be bought. Stock is only counted where the admin turned on
// "Count stock" for the option (track_stock); an option that isn't counted is
// always available, whatever its number says (most sit at 0, never set).
export const UNCOUNTED = 999;
function stockOf(v: { stock_qty: unknown; track_stock?: boolean | null }) {
  return v.track_stock ? toNumber(v.stock_qty) : UNCOUNTED;
}

function normalizeVariants(
  rows: { id: string; label: string; price: unknown; stock_qty: unknown; track_stock?: boolean | null; sort_order: number; compare_at?: unknown }[] | null,
): DbVariant[] {
  if (!rows?.length) return [{ id: "default", label: "Default", stockQty: 0 }];
  return rows.slice().sort((a, b) => a.sort_order - b.sort_order).map((v) => ({
    id: v.id, label: v.label, price: toNumber(v.price) || undefined, stockQty: stockOf(v), compareAt: toNumber(v.compare_at) || undefined,
  }));
}

function minPriced(variants: DbVariant[]) {
  const priced = variants.map((v) => v.price).filter((p): p is number => p !== undefined);
  return priced.length ? Math.min(...priced) : undefined;
}

// the cheapest priced option's "was" price, when it's above what it sells for
function markedDown(variants: DbVariant[]) {
  const cheapest = variants.filter((v) => v.price !== undefined).sort((a, b) => a.price! - b.price!)[0];
  return cheapest?.compareAt && cheapest.compareAt > cheapest.price! ? cheapest.compareAt : undefined;
}

function toCard(row: {
  slug: string;
  name: string;
  subcategory?: string | null;
  brand?: string | null;
  created_at?: string | null;
  product_variants: { id: string; label: string; price: unknown; stock_qty: unknown; track_stock?: boolean | null; sort_order: number; compare_at?: unknown }[] | null;
}): DbCardProduct {
  const variants = normalizeVariants(row.product_variants);
  return {
    slug: row.slug,
    name: row.name,
    variantCount: variants.length,
    // the lowest real price; none yet (all stand-ins) leaves it unset
    minPrice: minPriced(variants),
    mrp: markedDown(variants),
    variants,
    ...(row.subcategory ? { subcategory: row.subcategory } : {}),
    ...(row.brand?.trim() ? { brand: row.brand.trim() } : {}),
    ...(row.created_at ? { added: row.created_at } : {}),
  };
}

// All categories, in the client's chosen order. Categories default to
// visible, so this is the full 19 unless one is deliberately hidden.
export async function getCategories(): Promise<DbCategory[]> {
  const sb = client();
  const data = sb ? (await sb.from("categories").select("slug, name").order("sort_order")).data : null;
  if (data?.length || !useLocal) return data ?? [];
  return CATEGORIES.map(({ slug, name }) => ({ slug, name }));
}

// Same reasoning as getStaticProductParams: `output: export` refuses to
// build a dynamic page whose generateStaticParams() returns an empty array,
// which happens for real whenever the build runs with no Supabase client
// (no env vars) or a client that legitimately has zero categories yet. A
// placeholder slug that 404s correctly satisfies the export requirement
// without pretending a real category exists.
export async function getStaticCategoryParams(): Promise<{ category: string }[]> {
  const categories = await getCategories();
  return categories.length ? categories.map((c) => ({ category: c.slug })) : [{ category: "_none" }];
}

export async function getCategoriesWithCounts(): Promise<(DbCategory & { count: number })[]> {
  const live = await liveCategoriesWithCounts();
  if (live.length || !useLocal) return live;
  return CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, count: c.products.length }));
}

async function liveCategoriesWithCounts(): Promise<(DbCategory & { count: number })[]> {
  const sb = client();
  if (!sb) return [];
  const [{ data: cats }, { data: prods }] = await Promise.all([
    sb.from("categories").select("id, slug, name").order("sort_order"),
    sb.from("products").select("category_id"),
  ]);
  const counts = new Map<string, number>();
  for (const p of prods ?? []) {
    counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }
  return (cats ?? []).map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.id) ?? 0 }));
}

// The category list for the landing and the shop index.
export async function getIndexCategories() {
  return getCategoriesWithCounts();
}

// A null from the live read means the category isn't there (or the database
// isn't); an existing category with no products stays empty, no stand-in.
export async function getCategoryDetail(slug: string) {
  const live = await liveCategoryDetail(slug);
  return live || !useLocal ? live : localCategoryDetail(slug);
}

async function liveCategoryDetail(slug: string) {
  const sb = client();
  if (!sb) return null;
  const { data: category } = await sb.from("categories").select("id, slug, name, tagline").eq("slug", slug).maybeSingle();
  if (!category) return null;
  const { data: products } = await sb
    .from("products")
    .select("slug, name, sort_order, seo_title, subcategory, brand, created_at, product_variants(id, label, price, stock_qty, track_stock, sort_order, compare_at)")
    .eq("category_id", category.id)
    .order("sort_order");
  return {
    category: { slug: category.slug, name: category.name, tagline: (category as { tagline?: string | null }).tagline ?? "" },
    products: (products ?? []).map((p) => ({ ...toCard(p), seoTitle: (p as { seo_title?: string }).seo_title ?? "" })),
  };
}

// A product's description and brand, for the desktop product page (the
// shelf's cards don't carry them). Empty when there is none or no database.
export type ProductSpec = { label: string; value: string };
export async function getProductDescription(productSlug: string): Promise<{ description: string; brand: string; specs: ProductSpec[] }> {
  const sb = client();
  if (!sb) return { description: "", brand: "", specs: [] };
  const { data } = await sb.from("products").select("description, brand, specs").eq("slug", productSlug).maybeSingle();
  const specs = Array.isArray(data?.specs) ? (data.specs as ProductSpec[]).filter((r) => r && r.label && r.value) : [];
  return { description: data?.description ?? "", brand: data?.brand ?? "", specs };
}

export async function getProductDetail(categorySlug: string, productSlug: string) {
  const live = await liveProductDetail(categorySlug, productSlug);
  return live || !useLocal ? live : localProductDetail(categorySlug, productSlug);
}

async function liveProductDetail(categorySlug: string, productSlug: string) {
  const sb = client();
  if (!sb) return null;
  const { data: category } = await sb.from("categories").select("id, slug, name").eq("slug", categorySlug).maybeSingle();
  if (!category) return null;
  const { data: product } = await sb
    .from("products")
    .select("id, slug, name, description, product_variants(id, label, price, stock_qty, track_stock, sort_order, compare_at)")
    .eq("category_id", category.id)
    .eq("slug", productSlug)
    .maybeSingle();
  const variants = normalizeVariants(product?.product_variants ?? null);
  if (!product) return null;
  const { data: moreRows } = await sb
    .from("products")
    .select("slug, name, sort_order, product_variants(id, label, price, stock_qty, track_stock, sort_order, compare_at)")
    .eq("category_id", category.id)
    .neq("slug", productSlug)
    .order("sort_order")
    .limit(8);
  return {
    category: { slug: category.slug, name: category.name },
    product: {
      slug: product.slug,
      name: product.name,
      description: product.description,
      variants,
    },
    more: (moreRows ?? []).map(toCard).slice(0, 4),
  };
}

// Preserve old product URLs in the static export.
export async function getStaticProductParams(): Promise<{ category: string; product: string }[]> {
  const sb = client();
  const data = sb ? (await sb.from("products").select("slug, categories!inner(slug)")).data : null;
  const rows = (data ?? []).map((p) => ({
    category: (p.categories as unknown as { slug: string }).slug,
    product: p.slug,
  }));
  if (rows.length) return rows;
  if (useLocal) return CATEGORIES.flatMap((c) => c.products.map((p) => ({ category: c.slug, product: p.slug })));
  return [{ category: "_none", product: "_none" }];
}

export type DbSearchProduct = DbCardProduct & { categorySlug: string; categoryName: string };

export async function getSearchCatalog(): Promise<DbSearchProduct[]> {
  const live = await liveSearchCatalog();
  if (live !== null || !useLocal) return live ?? [];
  return CATEGORIES.flatMap((c) =>
    c.products.map((p) => ({ ...localCard(p), categorySlug: c.slug, categoryName: c.name })),
  );
}

export async function liveSearchCatalog(): Promise<DbSearchProduct[] | null> {
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb
    .from("products")
    .select("slug, name, subcategory, brand, created_at, product_variants(id, label, price, stock_qty, track_stock, sort_order, compare_at), categories!inner(slug, name)")
    .eq("is_visible", true).eq("categories.is_visible", true).order("sort_order");
  if (error) return null;
  return (data ?? [])
    .map((row) => {
      const cat = row.categories as unknown as { slug: string; name: string };
      return { ...toCard(row), categorySlug: cat.slug, categoryName: cat.name };
    });
}

// A few products from each category that have photos, for the 3D shop: they
// pop out of their fixture when it is looked at. Categories with no photos
// yet are left out.
export type ShelfPick = { slug: string; name: string; cat: string; image: string };
export async function getShelfPicks(slugs: string[], per = 4): Promise<Record<string, ShelfPick[]>> {
  const out: Record<string, ShelfPick[]> = {};
  await Promise.all(
    slugs.map(async (cat) => {
      const detail = await getCategoryDetail(cat);
      const picks = (detail?.products ?? [])
        .map((p) => ({ slug: p.slug, name: p.name, cat, image: photosFor(p.slug)[0] ?? "" }))
        .filter((p) => p.image)
        .slice(0, per);
      if (picks.length) out[cat] = picks;
    }),
  );
  return out;
}

// ---------------------------------------------------------------- search-engine listings

// Everything the page titles need, for every visible product, read once per
// build (each of the ~450 product pages asks; one query answers them all).
export type SeoProduct = {
  slug: string;
  categorySlug: string;
  categoryName: string;
  name: string;
  description: string;
  brand: string;
  seoTitle: string;
  seoDescription: string;
  minPrice?: number;
  maxPrice?: number;
  // any option for sale: stock above zero, or stock not counted
  inStock: boolean;
};
let seoCache: Promise<SeoProduct[]> | null = null;
export function getSeoCatalog(): Promise<SeoProduct[]> {
  return (seoCache ??= (async () => {
    const sb = client();
    const data = sb
      ? (await sb.from("products").select("slug, name, description, brand, seo_title, seo_description, categories!inner(slug, name), product_variants(price, stock_qty, track_stock)")).data
      : null;
    if (data?.length)
      return data.map((p) => {
        const c = p.categories as unknown as { slug: string; name: string };
        const vs = (p.product_variants ?? []) as { price: unknown; stock_qty: unknown; track_stock?: boolean | null }[];
        const prices = vs.map((v) => toNumber(v.price)).filter((x) => x > 0);
        return {
          slug: p.slug,
          categorySlug: c.slug,
          categoryName: c.name,
          name: p.name,
          description: p.description ?? "",
          brand: p.brand ?? "",
          seoTitle: p.seo_title ?? "",
          seoDescription: p.seo_description ?? "",
          minPrice: prices.length ? Math.min(...prices) : undefined,
          maxPrice: prices.length ? Math.max(...prices) : undefined,
          inStock: vs.some((v) => stockOf(v) > 0),
        };
      });
    if (!useLocal) return [];
    return CATEGORIES.flatMap((c) =>
      c.products.map((p) => ({ slug: p.slug, categorySlug: c.slug, categoryName: c.name, name: p.name, description: "", brand: "", seoTitle: "", seoDescription: "", inStock: true })),
    );
  })());
}

export async function getSeoProduct(categorySlug: string, productSlug: string) {
  return (await getSeoCatalog()).find((p) => p.categorySlug === categorySlug && p.slug === productSlug) ?? null;
}
