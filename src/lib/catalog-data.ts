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

export type CatalogCategory = {
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

export function getCategory(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getProduct(categorySlug: string, productSlug: string) {
  const category = getCategory(categorySlug);
  return category?.products.find((p) => p.slug === productSlug);
}

// Cart/orders are still demo-only until checkout is wired up — pick a
// couple of real catalog products so the flow at least references real
// names instead of invented ones.
const cartCategory = CATEGORIES.find((c) => c.slug === "bong");
const cartProduct1 = cartCategory?.products[0];
const cartCategory2 = CATEGORIES.find((c) => c.slug === "grinder");
const cartProduct2 = cartCategory2?.products[0];

export const PLACEHOLDER_CART = [
  cartProduct1 && cartCategory
    ? { ...cartProduct1, categorySlug: cartCategory.slug, qty: 1, price: 3500 }
    : null,
  cartProduct2 && cartCategory2
    ? { ...cartProduct2, categorySlug: cartCategory2.slug, qty: 2, price: 650 }
    : null,
].filter((x): x is NonNullable<typeof x> => x !== null);

export const PLACEHOLDER_ORDERS = [
  { id: "1001", placedOn: "2026-09-10", status: "Payment submitted", total: 5200 },
  { id: "1002", placedOn: "2026-09-02", status: "Confirmed", total: 1600 },
];
