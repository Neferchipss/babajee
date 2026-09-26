// Server-side reads of the live catalogue (categories, products, variants).
// Used only by the shop pages — cart/checkout/orders still run on the
// placeholder data in catalog-data.ts until that step is built.
//
// This is a plain server-side client (no browser session), so it only ever
// sees what row-level security lets an anonymous visitor see: is_visible
// rows. A hidden or unpriced product simply does not appear here.
import { createClient } from "@supabase/supabase-js";
import { toNumber } from "./currency";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function client() {
  if (!URL || !KEY) return null;
  return createClient(URL, KEY, { auth: { persistSession: false } });
}

export type DbVariant = { id: string; label: string; price: number; stockQty: number };
export type DbCardProduct = {
  slug: string;
  name: string;
  variantCount: number;
  minPrice: number;
  variants: DbVariant[];
};
export type DbCategory = { slug: string; name: string };

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
    minPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : 0,
    variants,
  };
}

// All categories, in the client's chosen order. Categories default to
// visible, so this is the full 19 unless one is deliberately hidden.
export async function getCategories(): Promise<DbCategory[]> {
  const sb = client();
  if (!sb) return [];
  const { data } = await sb.from("categories").select("slug, name").order("sort_order");
  return data ?? [];
}

export async function getCategoriesWithCounts(): Promise<(DbCategory & { count: number })[]> {
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

export async function getCategoryDetail(slug: string) {
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
  if (!sb) return [{ category: "_none", product: "_none" }];
  const { data } = await sb.from("products").select("slug, categories!inner(slug)");
  const rows = (data ?? []).map((p) => ({
    category: (p.categories as unknown as { slug: string }).slug,
    product: p.slug,
  }));
  return rows.length ? rows : [{ category: "_none", product: "_none" }];
}

export type DbSearchProduct = DbCardProduct & { categorySlug: string; categoryName: string };

export async function getSearchCatalog(): Promise<DbSearchProduct[]> {
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
