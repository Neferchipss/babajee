// Server-side reads of the live catalogue (categories, products, variants).
// Used only by the shop pages — cart/checkout/orders still run on the
// placeholder data in catalog-data.ts until that step is built.
//
// This is a plain server-side client (no browser session), so it only ever
// sees what row-level security lets an anonymous visitor see: is_visible
// rows. A hidden or unpriced product simply does not appear here.
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES, type CatalogProduct } from "./catalog-data";
import { toNumber } from "./currency";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function client() {
  if (!URL || !KEY) return null;
  // Where the stock sheet can stand in (useLocal, below), an unreachable
  // database should give up at once rather than retry for 1 + 2 + 4 seconds:
  // with the project offline, that wait made every dev page take 7 seconds.
  return createClient(URL, KEY, { auth: { persistSession: false }, db: { retry: !useLocal } });
}

// Price is unset only for local stand-in products (see useLocal below); it
// then renders as the "₹420.00" placeholder.
export type DbVariant = { id: string; label: string; price?: number; stockQty: number };
export type DbCardProduct = {
  slug: string;
  name: string;
  variantCount: number;
  minPrice?: number;
  variants: DbVariant[];
  // how it is packed, e.g. "Box of 50" (from the stock sheet, when known)
  unit?: string;
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

function normalizeVariants(
  rows: { id: string; label: string; price: unknown; stock_qty: unknown; sort_order: number }[] | null,
): DbVariant[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((v) => ({ id: v.id, label: v.label, price: toNumber(v.price), stockQty: toNumber(v.stock_qty) }));
}

function toCard(row: {
  slug: string;
  name: string;
  product_variants: { id: string; label: string; price: unknown; stock_qty: unknown; sort_order: number }[] | null;
}): DbCardProduct {
  const variants = normalizeVariants(row.product_variants);
  return {
    slug: row.slug,
    name: row.name,
    variantCount: variants.length,
    minPrice: variants.length ? Math.min(...variants.map((v) => v.price ?? 0)) : 0,
    variants,
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
    sb.from("products").select("category_id, product_variants(id)"),
  ]);
  const counts = new Map<string, number>();
  // Same rule as everywhere else: a product with no visible variant does not
  // count as something a visitor can actually see or buy.
  for (const p of prods ?? []) {
    if ((p.product_variants ?? []).length === 0) continue;
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
  const { data: category } = await sb.from("categories").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!category) return null;
  const { data: products } = await sb
    .from("products")
    .select("slug, name, sort_order, product_variants(id, label, price, stock_qty, sort_order)")
    .eq("category_id", category.id)
    .order("sort_order");
  return {
    category: { slug: category.slug, name: category.name },
    // A product shows here only once it has a visible variant. A product
    // marked visible with no visible option isn't actually buyable, so it
    // must not appear as if it were.
    products: (products ?? []).map(toCard).filter((p) => p.variantCount > 0),
  };
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
    .select("id, slug, name, description, product_variants(id, label, price, stock_qty, sort_order)")
    .eq("category_id", category.id)
    .eq("slug", productSlug)
    .maybeSingle();
  const variants = normalizeVariants(product?.product_variants ?? null);
  // Same rule as the category grid: no visible variant means not actually
  // buyable, so the page does not exist yet, same as any other 404.
  if (!product || variants.length === 0) return null;
  const { data: moreRows } = await sb
    .from("products")
    .select("slug, name, sort_order, product_variants(id, label, price, stock_qty, sort_order)")
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
    more: (moreRows ?? []).map(toCard).filter((p) => p.variantCount > 0).slice(0, 4),
  };
}

// Every visible product, for generateStaticParams. A product that is hidden
// or has no priced variant simply will not appear here, so its page is not
// built until an admin prices and unhides it. Static export requires at
// least one route for a dynamic page, so when nothing is priced yet this
// returns one placeholder pair that matches no real category — visiting it
// correctly 404s (see the page component).
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
  if (live.length || !useLocal) return live;
  return CATEGORIES.flatMap((c) =>
    c.products.map((p) => ({ ...localCard(p), categorySlug: c.slug, categoryName: c.name })),
  );
}

async function liveSearchCatalog(): Promise<DbSearchProduct[]> {
  const sb = client();
  if (!sb) return [];
  const { data } = await sb
    .from("products")
    .select("slug, name, product_variants(id, label, price, stock_qty, sort_order), categories!inner(slug, name)");
  return (data ?? [])
    .map((row) => {
      const cat = row.categories as unknown as { slug: string; name: string };
      return { ...toCard(row), categorySlug: cat.slug, categoryName: cat.name };
    })
    .filter((p) => p.variantCount > 0);
}
