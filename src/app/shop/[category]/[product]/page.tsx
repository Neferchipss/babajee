import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import { getCategory, getProduct } from "@/lib/catalog-data";

export default async function ProductPage(
  props: PageProps<"/shop/[category]/[product]">
) {
  const { category: categorySlug, product: productSlug } = await props.params;
  const category = getCategory(categorySlug);
  const product = category && getProduct(categorySlug, productSlug);
  if (!category || !product) notFound();

  return (
    <PageShell title={product.name} sow="Product Catalogue — SOW #4">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="aspect-square rounded-lg bg-neutral-800" />
        <div>
          {product.unitsPerBox && (
            <p className="text-sm text-neutral-500">{product.unitsPerBox} per box</p>
          )}
          <p className="mt-2 text-lg text-neutral-500">Price pending client data</p>

          {product.variants.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-neutral-500">Options</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-white px-3 py-1 text-xs">
                  Default
                </span>
                {product.variants.map((v) => (
                  <span key={v.label} className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400">
                    {v.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Link
            href="/cart"
            className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-black"
          >
            Add to cart
          </Link>
          <p className="mt-4">
            <Link href={`/shop/${category.slug}`} className="text-sm text-neutral-500 hover:text-neutral-300">
              &larr; Back to {category.name}
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
