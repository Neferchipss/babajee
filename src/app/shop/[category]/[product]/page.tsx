import Link from "next/link";
import { notFound } from "next/navigation";
import Price from "@/components/Price";
import ProductArt from "@/components/ProductArt";
import ProductBuy from "@/components/ProductBuy";
import { CATEGORIES, getCategory, getProduct } from "@/lib/catalog-data";
import { categoryTone } from "@/lib/tone";
import { displayName, splitVariantName } from "@/lib/variants";

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.flatMap((c) =>
    c.products.map((p) => ({ category: c.slug, product: p.slug }))
  );
}

export default async function ProductPage(props: PageProps<"/shop/[category]/[product]">) {
  const { category: categorySlug, product: productSlug } = await props.params;
  const category = getCategory(categorySlug);
  const product = category && getProduct(categorySlug, productSlug);
  if (!category || !product) notFound();

  const tone = categoryTone(category.slug);
  const more = category.products.filter((p) => p.slug !== product.slug).slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted">
        <Link href="/shop" className="hover:text-paper">
          Shop
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/shop/${category.slug}`} className="hover:text-paper">
          {category.name}
        </Link>
      </nav>

      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <ProductArt name={product.name} tone={tone} className="w-full max-w-lg" />

        <div>
          <h1 className="text-3xl sm:text-4xl">{displayName(product)}</h1>
          <Price className="mt-5 block text-2xl font-medium" />
          {product.unitsPerBox && (
            <p className="mt-2 text-muted">{product.unitsPerBox} per box</p>
          )}

          <div className="mt-8">
            <ProductBuy
              firstOption={splitVariantName(product.name).label}
              variants={product.variants.map((v) => v.label)}
            />
          </div>
        </div>
      </div>

      {more.length > 0 && (
        <section className="mt-20" aria-labelledby="more-heading">
          <h2 id="more-heading" className="mb-6 text-3xl">
            More in {category.name}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 lg:grid-cols-4">
            {more.map((p) => (
              <li key={p.slug}>
                <Link href={`/shop/${category.slug}/${p.slug}`} className="group block">
                  <ProductArt
                    name={p.name}
                    tone={tone}
                    className="ring-1 ring-transparent transition group-hover:ring-paper/50"
                  />
                  <h3 className="mt-3 text-[0.95rem] font-medium leading-snug tracking-normal">
                    {displayName(p)}
                  </h3>
                  <Price className="mt-1 block text-sm text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
