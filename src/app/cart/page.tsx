import CartView from "@/components/CartView";
import Page from "@/components/Page";
import type { CardProduct } from "@/components/ProductCard";
import SavedList from "@/components/SavedList";
import { getCategoriesWithCounts, getCategoryDetail } from "@/lib/catalog-db";
import { toneAt } from "@/lib/tone";

// "You might also like": a few products from each of the first categories,
// gathered when the page is built (the cart itself lives in the browser, so
// the row leaves out whatever is already in the jar there).
async function getRecs(): Promise<CardProduct[]> {
  const categories = await getCategoriesWithCounts();
  const picks = await Promise.all(
    categories.slice(0, 5).map(async (c, i) => {
      const detail = await getCategoryDetail(c.slug);
      return (detail?.products ?? []).slice(0, 3).map((p) => ({
        href: `/shop/${c.slug}/${p.slug}`,
        name: p.name,
        options: p.variantCount > 1 ? p.variantCount - 1 : 0,
        price: p.minPrice,
        unit: p.unit,
        tone: toneAt(i),
        slug: p.slug,
        variants: p.variants.map(({ label, price, stockQty }) => ({ label, price, stockQty })),
      }));
    }),
  );
  // one from each category in turn, so the row is mixed
  const out: CardProduct[] = [];
  for (let k = 0; k < 3; k++) for (const list of picks) if (list[k]) out.push(list[k]);
  return out;
}

export default async function CartPage() {
  const recs = await getRecs();
  return (
    <Page title="Your cart">
      <CartView recs={recs} />
      <SavedList />
    </Page>
  );
}
