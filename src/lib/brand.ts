// The brand of a product, read from the front of its name ("Raw Classic Ks"
// is Raw's "Classic Ks"). The stock sheet has no brand column, so this list
// of the brands it carries is the source; a product whose name starts with
// none of them has no brand. Longer names first, so "Juicy Jays" wins over
// a shorter match.
const BRANDS: [brand: string, ...prefixes: string[]][] = [
  ["RAW", "raw"],
  ["Smoking", "smoking", "smk"],
  ["Elements", "elements"],
  ["OCB", "ocb"],
  ["Juicy Jay's", "juicy jays", "juicy jay"],
  ["Gizeh", "gizeh"],
  ["Rizla", "rizla"],
  ["Purize", "purize"],
  ["Abadie", "abadie"],
  ["Purple Monkey", "purple monkey"],
  ["Skunk Brand", "skunk brand"],
  ["Kukuxumusu", "kukuxusumu", "kukuxumusu"],
  ["Irie", "irie"],
  ["4 Shades", "4 shades"],
  ["Luxe", "luxe"],
  ["B.E", "b.e"],
  ["Kingpin", "kingpin"],
  ["Cyclone", "cyclone"],
  ["Hemper", "hemper"],
  ["Double Platinum", "double platinum"],
  ["Clipper", "clipper"],
  ["Zippo", "zippo"],
  ["Stash Pro", "stash pro"],
  ["Angelo", "angelo"],
  ["Kaseki", "kaseki"],
  ["DTRH", "dtrh"],
  ["Vac Stash", "vac stash"],
  ["Actitube", "actitube"],
  ["Piper", "piper"],
  ["Capa Flora", "capa flora"],
  ["Backwoods", "backwoods"],
  ["Guantanamera", "guantanamera"],
  ["American Spirit", "american spirit"],
  ["Golden Virginia", "golden virginia"],
  ["Pueblo", "pueblo"],
  ["Drum", "drum"],
  ["Amber Leaf", "amber leaf"],
  ["Dutchland", "dutchland"],
  ["Smoke Buddy", "smoke buddy"],
  ["Aromas de San Andrés", "aromas - de san andhreas", "aromas de san andres"],
  ["Babajee", "babajee"],
];

const PREFIXES = BRANDS.flatMap(([brand, ...ps]) => ps.map((p) => [p, brand] as const)).sort(
  (a, b) => b[0].length - a[0].length,
);

export type Branded = { brand?: string; title: string };

// { brand, title }: title is the name without the brand in front, for
// showing under the brand. Collaborations ("Raw x Ryot ...") and names that
// would be left empty keep their full name as the title.
export function brandOf(name: string): Branded {
  const lower = name.trim().toLowerCase();
  for (const [prefix, brand] of PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    const next = lower.charAt(prefix.length);
    if (next && !/[\s\-–:']/.test(next)) continue; // "Drumstick" is not Drum
    const rest = name
      .trim()
      .slice(prefix.length)
      .replace(/^['’]?s?\s*[-–:]?\s*/, "");
    const keep = !rest || /^x\s/i.test(rest);
    return { brand, title: keep ? name.trim() : rest };
  }
  return { title: name.trim() };
}

// a shelf's products in brand groups: the brands with the most products
// first, the house brand after them, unbranded last. Order inside a group
// is kept. Null when most of the shelf has no brand (glass, novelty
// grinders): grouping would only push the few branded ones to the top.
export function byBrand<T extends { name: string }>(items: T[]): { brand?: string; items: T[] }[] | null {
  const groups = new Map<string | undefined, T[]>();
  for (const it of items) {
    const b = brandOf(it.name).brand;
    groups.set(b, [...(groups.get(b) ?? []), it]);
  }
  const plain = groups.get(undefined)?.length ?? 0;
  if (groups.size < 2 || plain * 2 > items.length) return null;
  const rank = (b: string | undefined) => (b === undefined ? 2 : b === "Babajee" ? 1 : 0);
  return [...groups.entries()]
    .sort(([a, x], [b, y]) => rank(a) - rank(b) || y.length - x.length)
    .map(([brand, items]) => ({ brand, items }));
}

// the all-products shelf: grouped by the category each product is in,
// in the order the categories come
export function byGroup<T extends { group?: string }>(items: T[]): { brand?: string; items: T[] }[] {
  const groups = new Map<string | undefined, T[]>();
  for (const it of items) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
  return [...groups.entries()].map(([brand, items]) => ({ brand, items }));
}
