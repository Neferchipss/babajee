import CartView, { type RecGroup } from "@/components/CartView";
import type { CardProduct } from "@/components/ProductCard";
import SavedList from "@/components/SavedList";
import { getCategoriesWithCounts, getCategoryDetail } from "@/lib/catalog-db";
import { toneAt } from "@/lib/tone";

// Things to add, in tabs: "Did you forget?" (a mix from every category) and
// then a few categories of their own. Gathered when the page is built; the
// cart lives in the browser, so the rows leave out what is already in it there.
async function getRecs(): Promise<RecGroup[]> {
  const categories = (await getCategoriesWithCounts()).slice(0, 5);
  const shelves = await Promise.all(
    categories.map(async (c, i) => {
      const detail = await getCategoryDetail(c.slug);
      const products: CardProduct[] = (detail?.products ?? []).slice(0, 12).map((p) => ({
        href: `/shop/${c.slug}?p=${encodeURIComponent(p.slug)}`,
        name: p.name,
        options: p.variantCount > 1 ? p.variantCount - 1 : 0,
        price: p.minPrice,
        unit: p.unit,
        tone: toneAt(i),
        slug: p.slug,
        variants: p.variants.map(({ label, price, stockQty }) => ({ label, price, stockQty })),
      }));
      return { title: c.name, products };
    }),
  );
  // the mix: one from each category in turn
  const mix: CardProduct[] = [];
  for (let k = 0; k < 3; k++) for (const s of shelves) if (s.products[k]) mix.push(s.products[k]);
  return [{ title: "Did you forget?", products: mix }, ...shelves.filter((s) => s.products.length > 0)];
}

export default async function CartPage() {
  const recs = await getRecs();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-4 sm:px-8 sm:pt-8">
      <CartView recs={recs} />
      <SavedList />
    </div>
  );
}
