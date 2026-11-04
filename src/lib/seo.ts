// What a search engine (and a link preview on WhatsApp or Instagram) shows
// for a product: a title and a short description. The admin can write both
// (products.seo_title / seo_description); left empty, they're made here from
// the product itself. The shop's pages, the open product sheet and the
// admin's preview all use these, so they always agree.

export const SITE_NAME = "Babajee";
// Google shows about this much before cutting off with "…"
export const TITLE_MAX = 60;
export const DESC_MAX = 155;

type Seo = {
  name: string;
  category: string;
  description?: string | null;
  brand?: string | null;
  price?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/[\s,.;:–-]+\S*$/, "")}…`);
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

// "Rotary Missile Grinder · Grinder" (the page adds " | Babajee")
export function autoTitle(p: Pick<Seo, "name" | "category">) {
  return tidy(`${p.name} · ${p.category}`);
}

export function seoTitle(p: Seo) {
  return tidy(p.seoTitle ?? "") || autoTitle(p);
}

// the product's own description when it has one; otherwise a plain line
// made from its name, brand, category and price
export function autoDescription(p: Seo) {
  const own = tidy(p.description ?? "");
  const lead = own ? own.replace(/[.!]?$/, ".") : `${p.name}${p.brand ? ` by ${p.brand}` : ""}, from Babajee's ${p.category.toLowerCase()} shelf.`;
  const price = p.price && p.price > 0 ? ` From ₹${Math.round(p.price).toLocaleString("en-IN")}.` : "";
  return clip(`${lead}${price} Delivered across India.`, DESC_MAX);
}

export function seoDescription(p: Seo) {
  return tidy(p.seoDescription ?? "") || autoDescription(p);
}

// the whole browser-tab / search-result title
export const fullTitle = (title: string) => `${title} | ${SITE_NAME}`;
