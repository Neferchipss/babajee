// Product photos from the client's Drive folder, keyed by product slug.
// Pulled from the Drive folder (numbered photos only; bongs and the retail-only
// characters left out); the files live in public/products/.
// Each photo is cut out (clear background), centred and scaled to fill its
// square; it sits on the plate colour.
import variants from "./photo-variants.json";
import raw from "./product-photos.json";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PHOTOS = raw as Record<string, string[]>;

// Where the photos show several options (colours, designs), each option has
// its own photos (photo-variants.json): a product's photos are those of the
// option asked for, or of its first option.
const VARIANTS = variants as unknown as Record<string, [string, number[]][]>;

export function photosFor(slug: string | undefined, option?: string): string[] {
  const list = slug ? PHOTOS[slug] : undefined;
  if (!list) return [];
  const groups = VARIANTS[slug!];
  const picked = groups ? (groups.find(([label]) => label === option) ?? groups[0])[1].map((n) => list[n - 1]) : list;
  return picked.map((p) => BASE + p);
}

// true when each of the product's options has its own photos (its options
// are then shown as pictures rather than names)
export const hasOptionPhotos = (slug: string | undefined) => !!slug && !!VARIANTS[slug] && !!PHOTOS[slug];

// the product page's gallery follows the option chosen beside it
export const OPTION_EVENT = "bb:option";

