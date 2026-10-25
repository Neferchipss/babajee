// Product photos from the client's Drive folder, keyed by product slug.
// Pulled from the Drive folder (numbered photos only; bongs and the retail-only
// characters left out); the files live in public/products/.
// The photos are used as supplied: converted from HEIC and resized for the
// web, never cropped, retouched or recoloured.
import raw from "./product-photos.json";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PHOTOS = raw as Record<string, string[]>;

export function photosFor(slug: string | undefined): string[] {
  const list = slug ? PHOTOS[slug] : undefined;
  return list ? list.map((p) => BASE + p) : [];
}
