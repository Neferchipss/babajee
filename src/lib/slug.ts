// A name as an address part: "Café Grinder (Black)" -> "cafe-grinder-black".
// Accents become plain letters, anything else between words becomes one
// dash. max trims long names; fallback stands in when nothing is left
// (a name of only symbols). Used for products, sub-categories, collections
// and pages, so they all follow the same rules.
export function slugify(input: string, { max, fallback = "" }: { max?: number; fallback?: string } = {}): string {
  const s = input
    .normalize("NFKD")
    // NFKD splits "è" into "e" and an accent mark; the mark is dropped
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (max ? s.slice(0, max).replace(/-+$/, "") : s) || fallback;
}
