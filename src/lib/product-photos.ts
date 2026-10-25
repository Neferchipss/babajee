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


// the names of a product's options that have their own photos, in order
export const optionsWithPhotos = (slug: string | undefined): string[] =>
  slug && PHOTOS[slug] ? (VARIANTS[slug]?.map(([label]) => label) ?? []) : [];

// The dot for an option on a shelf card: the colour its name gives, or none
// (then the dot is a small round photo) for a pattern or design, where a
// flat colour would mislead ("Red Camo", "Galaxy", the soda cans).
const COLOURS: Record<string, string> = {
  silver: "#c3c7cc",
  black: "#1c1c1f",
  grey: "#8a8d91",
  gunmetal: "#53575d",
  white: "#f4f4f2",
  clear: "rgb(255 255 255 / 0.28)",
  blue: "#2f6fe4",
  navy: "#22306b",
  red: "#d9342b",
  orange: "#f07c2c",
  yellow: "#f3d03b",
  gold: "#d6aa3c",
  brass: "#c4a44c",
  bronze: "#a06c36",
  copper: "#bd6a3c",
  brown: "#7b4a2d",
  green: "#2f9e5c",
  "army green": "#5c6b3a",
  pink: "#f283b6",
  purple: "#7f4fd3",
};
const PATTERN = /camo|graffiti|galaxy|psychedelic|skull|mosaic|floral|heart|pastel|fanta|sprite|coca/i;
export function dotColour(label: string): string | null {
  if (PATTERN.test(label)) return null;
  const l = label.toLowerCase();
  const key = Object.keys(COLOURS)
    .sort((a, b) => b.length - a.length)
    .find((c) => ` ${l} `.includes(` ${c} `));
  return key ? COLOURS[key] : null;
}

// the option last picked on a shelf card, so the product sheet opens on it
export const shelfPicks = new Map<string, string>();
