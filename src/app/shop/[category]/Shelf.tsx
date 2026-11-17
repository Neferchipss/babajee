import { notFound } from "next/navigation";
import CategoryView from "@/components/CategoryView";
import { getCategoriesWithCounts, getCategoryDetail, getShopTags } from "@/lib/catalog-db";
import { photosFor } from "@/lib/product-photos";
import { toneAt } from "@/lib/tone";

// A category's shelf, as its own page and under each of its products' pages.
// open: a product's own page shows its shelf with that product open
// tag: a sub-category's own page shows the shelf with that tag chosen (0060)
export default async function Shelf({ categorySlug, open, tag }: { categorySlug: string; open?: string; tag?: string }) {
  const [detail, categories, { byCategory, ofProduct }] = await Promise.all([getCategoryDetail(categorySlug), getCategoriesWithCounts(), getShopTags()]);
  if (!detail) notFound();

  const tone = toneAt(Math.max(0, categories.findIndex((c) => c.slug === categorySlug)));

  return (
    <CategoryView
      category={detail.category}
      open={open}
      tag={tag}
      tags={byCategory[categorySlug] ?? []}
      categories={categories}
      products={detail.products.map((p) => ({
        href: `/shop/${categorySlug}?p=${encodeURIComponent(p.slug)}`,
        name: p.name,
        options: p.variantCount > 1 ? p.variantCount - 1 : 0,
        price: p.minPrice,
        mrp: p.mrp,
        unit: p.unit,
        images: photosFor(p.slug),
        tone,
        slug: p.slug,
        seoTitle: p.seoTitle,
        tags: ofProduct[p.slug] ?? [],
        brand: p.brand,
        added: p.added,
        variants: p.variants.map(({ label, price, stockQty }) => ({ label, price, stockQty })),
      }))}
    />
  );
}
