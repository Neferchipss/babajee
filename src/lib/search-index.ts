// Every product, as the search bar's suggestions read them: its name, where
// it lives, its first photo, and the words it can be found by (name, brand,
// category). Built from the stock sheet the site is listing.
import { brandOf } from "./brand";
import { CATEGORIES } from "./catalog-data";
import { photosFor } from "./product-photos";

export type Suggestion = {
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  photo?: string;
  words: string;
};

let index: Suggestion[] | null = null;
const all = () =>
  (index ??= CATEGORIES.flatMap((c) =>
    c.products.map((p) => ({
      slug: p.slug,
      name: p.name,
      category: c.name,
      categorySlug: c.slug,
      photo: photosFor(p.slug)[0],
      words: `${p.name} ${brandOf(p.name).brand ?? ""} ${c.name}`.toLowerCase(),
    })),
  ));

// The products every word of the query is found in, best first: those where
// each word starts a word of the name ("raw tr" -> RAW Rolling TRay before
// RAW DrawsTRing bag), then names that start with the whole query.
export function suggest(query: string, limit = 8): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const score = (s: Suggestion) => {
    const name = s.name.toLowerCase();
    const parts = name.split(/[\s\-–(/+]+/);
    const misses = words.filter((w) => !parts.some((t) => t.startsWith(w))).length;
    return misses * 2 + (name.startsWith(q) ? 0 : 1);
  };
  return all()
    .filter((s) => words.every((w) => s.words.includes(w)))
    .map((s, i) => [score(s), i, s] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, limit)
    .map(([, , s]) => s);
}
