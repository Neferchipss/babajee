import { getSupabase } from "./supabase";

// Collections (migration 0041): hand-picked, ordered lists of products, each
// with its own shelf on the shop. The shop reads the switched-on ones; the
// admin builds and orders them.
// product_slugs: the ones the caller can see (the shop: published products only)
export type Collection = { id: string; slug: string; name: string; tagline: string; sort_order: number; is_visible: boolean; product_ids: string[]; product_slugs: string[] };

const COLUMNS = "id, slug, name, tagline, sort_order, is_visible, collection_items(product_id, position, products(slug))";
type Item = { product_id: string; position: number; products: { slug: string } | { slug: string }[] | null };
type Row = Omit<Collection, "product_ids" | "product_slugs"> & { collection_items: Item[] | null };
const slugOf = (i: Item) => (Array.isArray(i.products) ? i.products[0]?.slug : i.products?.slug) ?? "";
const toCollection = (r: Row): Collection => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  tagline: r.tagline ?? "",
  sort_order: r.sort_order,
  is_visible: r.is_visible,
  product_ids: (r.collection_items ?? []).slice().sort((a, b) => a.position - b.position).map((i) => i.product_id),
  product_slugs: (r.collection_items ?? []).slice().sort((a, b) => a.position - b.position).map(slugOf).filter(Boolean),
});

function db() {
  const sb = getSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb;
}

// every collection the caller may see (the shop: switched-on ones), in order
export async function listCollections(): Promise<Collection[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("collections").select(COLUMNS).order("sort_order").order("name");
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toCollection);
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "collection";

export async function createCollection(name: string, sort_order: number): Promise<string> {
  const { data, error } = await db().from("collections").insert({ name: name.trim(), slug: slugify(name), sort_order }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateCollection(id: string, patch: Partial<Pick<Collection, "name" | "tagline" | "is_visible" | "sort_order">>) {
  const { error } = await db().from("collections").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCollection(id: string) {
  const { error } = await db().from("collections").delete().eq("id", id);
  if (error) throw error;
}

// the collection's products, in this order (replaces what was there)
export async function setCollectionProducts(id: string, productIds: string[]) {
  const sb = db();
  const { error: e1 } = await sb.from("collection_items").delete().eq("collection_id", id);
  if (e1) throw e1;
  if (!productIds.length) return;
  const { error: e2 } = await sb.from("collection_items").insert(productIds.map((product_id, position) => ({ collection_id: id, product_id, position })));
  if (e2) throw e2;
}
