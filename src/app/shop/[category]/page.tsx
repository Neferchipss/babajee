import { notFound } from "next/navigation";
import CategoryView from "@/components/CategoryView";
import { CATEGORIES, getCategory } from "@/lib/catalog-data";
import { categoryTone } from "@/lib/tone";
import { displayName } from "@/lib/variants";

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export default async function CategoryPage(props: PageProps<"/shop/[category]">) {
  const { category: categorySlug } = await props.params;
  const category = getCategory(categorySlug);
  if (!category) notFound();

  const tone = categoryTone(category.slug);

  return (
    <CategoryView
      category={{ slug: category.slug, name: category.name }}
      categories={CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, count: c.products.length }))}
      products={category.products.map((p) => ({
        href: `/shop/${category.slug}/${p.slug}`,
        name: displayName(p),
        options: p.variants.length,
        tone,
      }))}
    />
  );
}
