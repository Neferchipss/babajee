import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import { getCategory } from "@/lib/catalog-data";

export default async function CategoryPage(props: PageProps<"/shop/[category]">) {
  const { category: categorySlug } = await props.params;
  const category = getCategory(categorySlug);
  if (!category) notFound();

  return (
    <PageShell title={category.name} sow="Product Catalogue — SOW #4">
      <p className="mb-6 text-sm text-neutral-500">
        {category.products.length} products &middot; prices pending client data
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {category.products.map((product) => (
          <Link
            key={product.slug}
            href={`/shop/${category.slug}/${product.slug}`}
            className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <div className="aspect-square rounded bg-neutral-800" />
            <span className="text-sm font-medium">{product.name}</span>
            {product.variants.length > 0 && (
              <span className="text-xs text-neutral-500">
                {product.variants.length + 1} options
              </span>
            )}
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
