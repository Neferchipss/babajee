// Real product catalog, generated from the client's stock sheet.
// Regenerate with: python tools/parse_stock.py (from the repo root).
// No price or SKU data exists in the source sheet yet — still to come from
// the client.
//
// Products photographed in the client's Drive folder that the stock sheet
// does not list yet are added from drive-products.json, first in their
// category. Their photos (and those of the few sheet products that were
// photographed) are in product-photos.json.
import raw from "./catalog-data.json";
import drive from "./drive-products.json";
import photoVariants from "./photo-variants.json";

export type CatalogVariant = {
  label: string;
  unitsPerBox: number | null;
};

export type CatalogProduct = {
  slug: string;
  name: string;
  unitsPerBox: number | null;
  variants: CatalogVariant[];
};

type CatalogCategory = {
  slug: string;
  name: string;
  products: CatalogProduct[];
};

const EXTRA = drive as Record<string, CatalogProduct[]>;

// Colours and designs seen in a product's photos (photo-variants.json), as
// its options. Draft names until the client confirms what is stocked.
const VARIANTS = photoVariants as unknown as Record<string, [string, number[]][]>;
const withVariants = (p: CatalogProduct): CatalogProduct =>
  VARIANTS[p.slug] ? { ...p, variants: VARIANTS[p.slug].map(([label]) => ({ label, unitsPerBox: p.unitsPerBox })) } : p;

export const CATEGORIES: CatalogCategory[] = (raw as CatalogCategory[]).map((c) => ({
  ...c,
  products: [...(EXTRA[c.slug] ?? []), ...c.products].map(withVariants),
}));

