import { getCategoriesWithCounts, getCategoryDetail } from "@/lib/catalog-db";
import { photosFor } from "@/lib/product-photos";
import { toneAt } from "@/lib/tone";

// Every product in the shop as shelf cards, the categories in their order,
// each card knowing its category (for the headings): for the all-products
// shelf and the search page.
export async function allShelfProducts() {
  const categories = await getCategoriesWithCounts();
  const details = await Promise.all(categories.map((c) => getCategoryDetail(c.slug)));
  const products = details.flatMap((detail, i) =>
    detail
      ? detail.products.map((p) => ({
          href: `/shop/${detail.category.slug}/${p.slug}`,
          name: p.name,
          options: p.variantCount > 1 ? p.variantCount - 1 : 0,
          price: p.minPrice,
          unit: p.unit,
          images: photosFor(p.slug),
          tone: toneAt(i),
          slug: p.slug,
          variants: p.variants.map(({ label, price, stockQty }) => ({ label, price, stockQty })),
          group: detail.category.name,
        }))
      : [],
  );
  return { categories, products };
}
