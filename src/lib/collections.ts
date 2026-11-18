import { loadSupabase } from "./sb";

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

async function db() {
  const sb = await loadSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb;
}

// every collection the caller may see (the shop: switched-on ones), in order
export async function listCollections(): Promise<Collection[]> {
  const sb = await loadSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("collections").select(COLUMNS).order("sort_order").order("name");
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toCollection);
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "collection";

export async function createCollection(name: string, sort_order: number): Promise<string> {
  const { data, error } = await (await db()).from("collections").insert({ name: name.trim(), slug: slugify(name), sort_order }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateCollection(id: string, patch: Partial<Pick<Collection, "name" | "tagline" | "is_visible" | "sort_order">>) {
  const { error } = await (await db()).from("collections").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCollection(id: string) {
  const { error } = await (await db()).from("collections").delete().eq("id", id);
  if (error) throw error;
}

// the collection's products, in this order (replaces what was there)
export async function setCollectionProducts(id: string, productIds: string[]) {
  const sb = (await db());
  const { error: e1 } = await sb.from("collection_items").delete().eq("collection_id", id);
  if (e1) throw e1;
  if (!productIds.length) return;
  const { error: e2 } = await sb.from("collection_items").insert(productIds.map((product_id, position) => ({ collection_id: id, product_id, position })));
  if (e2) throw e2;
}

// ---------------------------------------------------------------- rules (0070)
// A collection can fill itself from rules instead of being hand-picked; the
// database works its products out again whenever products change. Read on
// their own so the shop and an older database never depend on them.
export type RuleField = "category" | "tag" | "brand" | "name" | "price" | "in_stock" | "on_sale" | "new_days" | "sold_days";
export type Rule = { field: RuleField; op: string; value: string | number | boolean };
export type CollectionSort = "manual" | "best_selling" | "newest" | "price_asc" | "price_desc" | "name";
export type CollectionRules = { mode: "manual" | "auto"; rules: Rule[]; match: "all" | "any"; sort: CollectionSort; max_items: number | null };
export const MANUAL: CollectionRules = { mode: "manual", rules: [], match: "all", sort: "best_selling", max_items: null };

export async function listCollectionRules(): Promise<Map<string, CollectionRules>> {
  const sb = await loadSupabase();
  const out = new Map<string, CollectionRules>();
  if (!sb) return out;
  const { data, error } = await sb.from("collections").select("id, mode, rules, match, sort, max_items");
  if (error) return out;
  for (const r of data ?? []) out.set(r.id, { mode: r.mode, rules: Array.isArray(r.rules) ? r.rules : [], match: r.match, sort: r.sort, max_items: r.max_items });
  return out;
}

export async function saveCollectionRules(id: string, r: CollectionRules) {
  const { error } = await (await db()).from("collections").update(r).eq("id", id);
  if (error) throw error;
}

// work its products out again now (they also follow every product change)
export async function refreshCollection(id: string): Promise<number> {
  const { data, error } = await (await db()).rpc("admin_refresh_collection", { p_collection: id });
  if (error) throw error;
  return Number(data ?? 0);
}

export type TagOption = { id: string; name: string; category_id: string };
export async function listAllTags(): Promise<TagOption[]> {
  const sb = await loadSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("subcategories").select("id, name, category_id").order("name");
  if (error) return [];
  return (data ?? []) as TagOption[];
}

// what a rule says, in words
export function ruleText(r: Rule, names: { category: (slug: string) => string; tag: (id: string) => string }): string {
  const v = String(r.value ?? "");
  switch (r.field) {
    case "category":
      return `${r.op === "is_not" ? "Not in" : "In"} ${names.category(v)}`;
    case "tag":
      return `Tagged ${names.tag(v)}`;
    case "brand":
      return r.op === "contains" ? `Brand contains "${v}"` : `Brand is ${v}`;
    case "name":
      return `Name ${r.op === "not_contains" ? "doesn't contain" : "contains"} "${v}"`;
    case "price":
      return `Price ${r.op === "over" ? "over" : "under"} ₹${v}`;
    case "in_stock":
      return "In stock";
    case "on_sale":
      return "On sale (has a compare-at price)";
    case "new_days":
      return `Added in the last ${v} days`;
    case "sold_days":
      return `Sold in the last ${v} days`;
  }
}
