import { notFound } from "next/navigation";
import CategoryView from "@/components/CategoryView";
import { getCategoriesWithCounts, getCategoryDetail, getStaticCategoryParams } from "@/lib/catalog-db";
import { toneAt } from "@/lib/tone";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getStaticCategoryParams();
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
        href: `/shop/${categorySlug}/${p.slug}`,
        name: p.name,
        options: p.variantCount > 1 ? p.variantCount - 1 : 0,
        price: p.minPrice,
        tone,
      }))}
    />
  );
}
