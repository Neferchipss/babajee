"use client";

// The shop's own content (migration 0073): banners, homepage sections,
// pages and blog posts, FAQs, menus, search listings for built-in pages, and
// which storefront design shows. Read by the shop (switched-on rows only) and
// written from Admin > Storefront. Every read falls back to nothing, so the
// shop works the same on a database without 0073. With ?demo=1 on a
// developer's machine the admin writes to memory instead.
import { loadSupabase } from "./sb";
import { slugify as slugifyAs } from "./slug";

// the admin's demo (?demo=1, never in a production build); kept here rather
// than imported, so the shop's pages don't carry the admin's code
const isAdminDemo = () => process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

export type Design = "current" | "shopfront" | "haveli" | "chai" | "courtyard";
export const DESIGNS: { id: Design; name: string; about: string }[] = [
  { id: "current", name: "Current", about: "The painted shop you walk into, as it is today." },
  { id: "shopfront", name: "Shopfront", about: "The current colours as a full shop home: rotating banners, best sellers, new arrivals, categories, and Explore the shop for the painted walk-in." },
  { id: "haveli", name: "Haveli", about: "Babajee red, turmeric and leaf green on warm cream, arches and soft paper: an old family home." },
  { id: "chai", name: "Chai corner", about: "Warm turmeric and tea tones, rounded cushions of colour, slow and cosy like the shop counter on a long evening." },
  { id: "courtyard", name: "Courtyard", about: "Leaf green and sunlight yellow with red pots: an open, airy courtyard to wander around." },
];

export type Tone = "gold" | "green" | "red" | "ink" | "paper";
export type Banner = { id: string; title: string; subtitle: string; image_url: string; link_url: string; button_label: string; tone: Tone; position: number; starts_at: string | null; ends_at: string | null; is_visible: boolean };
export type SectionKind = "banners" | "best_sellers" | "new_arrivals" | "collection" | "category" | "categories" | "text";
export type HomeSection = { id: string; kind: SectionKind; title: string; body: string; ref: string; item_count: number; position: number; is_visible: boolean };
export type SitePage = {
  id: string;
  kind: "page" | "post";
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  cover_url: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  is_visible: boolean;
  published_at: string | null;
  updated_at?: string;
};
export type Faq = { id: string; topic: string; question: string; answer: string; position: number; is_visible: boolean };
export type MenuLink = { id: string; location: "header" | "footer"; label: string; href: string; position: number; is_visible: boolean };
export type PageSeo = { path: string; title: string; description: string; image_url: string };
export type Look = { design: Design; announcement: string; announcement_link: string };

export const SECTION_KINDS: { kind: SectionKind; label: string; needsRef?: "collection" | "category" }[] = [
  { kind: "banners", label: "Rotating banners" },
  { kind: "categories", label: "Shop by category" },
  { kind: "best_sellers", label: "Best sellers" },
  { kind: "new_arrivals", label: "New arrivals" },
  { kind: "collection", label: "A collection", needsRef: "collection" },
  { kind: "category", label: "A category's products", needsRef: "category" },
  { kind: "text", label: "A few words" },
];

const LOOK_DEFAULT: Look = { design: "current", announcement: "", announcement_link: "" };

// ---------------------------------------------------------------- demo memory
type Tables = { site_banners: Banner[]; home_sections: HomeSection[]; site_pages: SitePage[]; faqs: Faq[]; site_menus: MenuLink[]; page_seo: PageSeo[] };
let mem: Tables | null = null;
let memLook: Look = { ...LOOK_DEFAULT };
function demo(): Tables {
  if (mem) return mem;
  const id = () => crypto.randomUUID();
  mem = {
    site_banners: [
      { id: id(), title: "New glass is in", subtitle: "Beakers, recyclers and gravity bongs, hand-picked.", image_url: "", link_url: "/shop/bong/", button_label: "See the glass", tone: "gold", position: 0, starts_at: null, ends_at: null, is_visible: true },
      { id: id(), title: "Free delivery over ₹999", subtitle: "Across India, packed discreetly.", image_url: "", link_url: "/shop/", button_label: "Start shopping", tone: "green", position: 1, starts_at: null, ends_at: null, is_visible: true },
    ],
    home_sections: (["banners", "categories", "best_sellers", "new_arrivals"] as SectionKind[]).map((k, i) => ({ id: id(), kind: k, title: ["", "Shop by category", "Best sellers", "New arrivals"][i], body: "", ref: "", item_count: 8, position: i, is_visible: true })),
    site_pages: [
      { id: id(), kind: "page", slug: "about-us", title: "About Babajee", body: "A family shop.\n\n## Our story\nWe started small.", excerpt: "", cover_url: "", tags: [], seo_title: "", seo_description: "", is_visible: true, published_at: new Date().toISOString() },
      { id: id(), kind: "post", slug: "how-to-pick-a-grinder", title: "How to pick a grinder", body: "Two-piece or four-piece?\n\n- Size\n- Material\n- Teeth", excerpt: "Size, material and teeth, explained.", cover_url: "", tags: ["guides"], seo_title: "", seo_description: "", is_visible: true, published_at: new Date().toISOString() },
    ],
    faqs: [
      { id: id(), topic: "Delivery", question: "Where do you deliver?", answer: "Everywhere in India.", position: 0, is_visible: true },
      { id: id(), topic: "Orders", question: "Can I cancel an order?", answer: "Yes, until it's packed.", position: 1, is_visible: true },
    ],
    site_menus: [{ id: id(), location: "footer", label: "Blog", href: "/blog/", position: 0, is_visible: true }],
    page_seo: [],
  };
  return mem;
}

async function db() {
  const sb = await loadSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb;
}

type Key = keyof Tables;
const ORDER: Record<Key, string> = { site_banners: "position", home_sections: "position", site_pages: "updated_at", faqs: "position", site_menus: "position", page_seo: "path" };

// every row (the admin sees switched-off ones too; the shop only live ones)
export async function listRows<K extends Key>(table: K): Promise<Tables[K]> {
  if (isAdminDemo()) return structuredClone(demo()[table]);
  const sb = await loadSupabase();
  if (!sb) return [] as unknown as Tables[K];
  const { data, error } = await sb
    .from(table)
    .select("*")
    .order(ORDER[table], { ascending: table !== "site_pages" });
  if (error) return [] as unknown as Tables[K];
  return (data ?? []) as Tables[K];
}

export async function saveRow<K extends Key>(table: K, row: Partial<Tables[K][number]> & { id?: string; path?: string }): Promise<string> {
  if (isAdminDemo()) {
    const list = demo()[table] as Array<Record<string, unknown>>;
    const keyName = table === "page_seo" ? "path" : "id";
    const k = (row as Record<string, unknown>)[keyName] as string | undefined;
    const at = k ? list.findIndex((r) => r[keyName] === k) : -1;
    if (at >= 0) list[at] = { ...list[at], ...row };
    else {
      const id = (row as Record<string, unknown>)[keyName] ?? crypto.randomUUID();
      list.push({ ...row, [keyName]: id, ...(table === "site_pages" && (row as Partial<SitePage>).is_visible ? { published_at: new Date().toISOString() } : {}) });
      return String(id);
    }
    return String(k);
  }
  if (table === "page_seo") {
    const { error } = await (await db()).from(table).upsert(row);
    if (error) throw error;
    return String(row.path);
  }
  if (row.id) {
    const { id, ...patch } = row;
    const { error } = await (await db()).from(table).update(patch).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await (await db()).from(table).insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteRow(table: Key, id: string) {
  if (isAdminDemo()) {
    const keyName = table === "page_seo" ? "path" : "id";
    (demo()[table] as Array<Record<string, unknown>>).splice(
      (demo()[table] as Array<Record<string, unknown>>).findIndex((r) => r[keyName] === id),
      1,
    );
    return;
  }
  const { error } = await (await db())
    .from(table)
    .delete()
    .eq(table === "page_seo" ? "path" : "id", id);
  if (error) throw error;
}

// new positions for a reordered list
export async function reorder(table: "site_banners" | "home_sections" | "faqs" | "site_menus", ids: string[]) {
  await Promise.all(ids.map((id, position) => saveRow(table, { id, position } as never)));
}

export async function getLook(): Promise<Look> {
  if (isAdminDemo()) return { ...memLook };
  const sb = await loadSupabase();
  if (!sb) return { ...LOOK_DEFAULT };
  const { data, error } = await sb.from("site_look").select("design, announcement, announcement_link").eq("id", 1).maybeSingle();
  if (error || !data) return { ...LOOK_DEFAULT };
  return data as Look;
}

export async function saveLook(patch: Partial<Look>) {
  if (isAdminDemo()) {
    memLook = { ...memLook, ...patch };
    return;
  }
  const { error } = await (await db()).from("site_look").update(patch).eq("id", 1);
  if (error) throw error;
}

// a banner picture, uploaded beside the product photos (0073)
export async function uploadBannerImage(file: File): Promise<string> {
  if (isAdminDemo()) return URL.createObjectURL(file);
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `banners/${crypto.randomUUID()}.${ext}`;
  const sb = await db();
  const { error } = await sb.storage.from("product-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw error;
  return sb.storage.from("product-photos").getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------- the shop's reads
export async function liveBanners(): Promise<Banner[]> {
  const now = Date.now();
  return (await listRows("site_banners")).filter((b) => b.is_visible && (!b.starts_at || Date.parse(b.starts_at) <= now) && (!b.ends_at || Date.parse(b.ends_at) > now));
}

export async function bestSellerSlugs(limit = 12): Promise<string[]> {
  const sb = await loadSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("shop_best_sellers", { p_days: 60, p_limit: limit });
  if (error) return [];
  return ((data ?? []) as { slug: string }[]).map((r) => r.slug);
}

export async function findPage(kind: "page" | "post", slug: string): Promise<SitePage | null> {
  if (isAdminDemo()) return demo().site_pages.find((p) => p.kind === kind && p.slug === slug) ?? null;
  const sb = await loadSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("site_pages").select("*").eq("kind", kind).eq("slug", slug).maybeSingle();
  if (error) return null;
  return (data as SitePage | null) ?? null;
}

export async function listPosts(): Promise<SitePage[]> {
  return (await listRows("site_pages")).filter((p) => p.kind === "post" && p.is_visible).sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}

export const slugify = (s: string) => slugifyAs(s, { max: 80, fallback: "page" });

export { blocks, inline } from "./rich-text";
