// The product photo for an order line, as the shop shows it (src/lib/product-photos.ts,
// whose JSON maps are read here directly so this also runs in Deno).
import variants from "../../../src/lib/photo-variants.json" with { type: "json" };
import dbRaw from "../../../src/lib/product-photos-db.json" with { type: "json" };
import raw from "../../../src/lib/product-photos.json" with { type: "json" };

const PHOTOS = raw as Record<string, string[]>;
const VARIANTS = variants as unknown as Record<string, [string, number[]][]>;
const DB = dbRaw as Record<string, { all: string[]; byOption: Record<string, string[]> }>;

// a site path ("/products/x/1.webp") or a full address, or null
export function photoOf(slug: string, option: string): string | null {
  const d = DB[slug];
  if (d && (d.all.length || Object.keys(d.byOption).length)) return (option && d.byOption[option]?.[0]) || d.all[0] || Object.values(d.byOption)[0]?.[0] || null;
  const list = PHOTOS[slug];
  if (!list?.length) return null;
  const groups = VARIANTS[slug];
  const n = groups ? ((groups.find(([label]) => label === option) ?? groups[0])[1][0] ?? 1) : 1;
  return list[n - 1] ?? list[0];
}
