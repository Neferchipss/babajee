import { CATEGORIES } from "./catalog-data";
import { toneAt } from "./tone";

// A category's colour, by its place in the catalogue. Apart from tone.ts so
// pages that only need the colour cycle don't load the whole catalogue.
export function categoryTone(slug: string) {
  return toneAt(Math.max(0, CATEGORIES.findIndex((c) => c.slug === slug)));
}
