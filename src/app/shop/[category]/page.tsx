import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryView from "@/components/CategoryView";
import { getCategoriesWithCounts, getCategoryDetail, getStaticCategoryParams } from "@/lib/catalog-db";
import { photosFor } from "@/lib/product-photos";
import { toneAt } from "@/lib/tone";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getStaticCategoryParams();
}

// "Grinder | Babajee", and a line on what's on the shelf
export async function generateMetadata(props: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category } = await props.params;
  const detail = await getCategoryDetail(category);
  if (!detail) return {};
  const n = detail.products.length;
  const description = `${n} ${detail.category.name.toLowerCase()} product${n === 1 ? "" : "s"} at Babajee: ${detail.products
    .slice(0, 3)
    .map((p) => p.name)
    .join(", ")}${n > 3 ? " and more" : ""}. Delivered across India.`;
  return { title: detail.category.name, description, alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/shop/${category}/` } };
}

export default async function CategoryPage(props: PageProps<"/shop/[category]">) {
  const { category: categorySlug } = await props.params;
  const [detail, categories] = await Promise.all([getCategoryDetail(categorySlug), getCategoriesWithCounts()]);
  if (!detail) notFound();

  const tone = toneAt(Math.max(0, categories.findIndex((c) => c.slug === categorySlug)));

  return (
    <CategoryView
      category={detail.category}
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
        variants: p.variants.map(({ label, price, stockQty }) => ({ label, price, stockQty })),
      }))}
    />
  );
}
