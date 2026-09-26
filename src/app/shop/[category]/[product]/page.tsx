import Link from "next/link";
import { notFound } from "next/navigation";
import Price from "@/components/Price";
import ProductArt from "@/components/ProductArt";
import ProductBuy from "@/components/ProductBuy";
import { getCategories, getProductDetail, getStaticProductParams } from "@/lib/catalog-db";
import { toneAt } from "@/lib/tone";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getStaticProductParams();
}

export default async function ProductPage(props: PageProps<"/shop/[category]/[product]">) {
  const { category: categorySlug, product: productSlug } = await props.params;
  const [detail, categories] = await Promise.all([getProductDetail(categorySlug, productSlug), getCategories()]);
  if (!detail) notFound();

  const { category, product, more } = detail;
  const tone = toneAt(Math.max(0, categories.findIndex((c) => c.slug === category.slug)));

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
          <h1 className="text-3xl sm:text-4xl">{product.name}</h1>
          {product.description && <p className="mt-2 text-muted">{product.description}</p>}

          <div className="mt-8">
            <ProductBuy variants={product.variants} />
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
                  <h3 className="mt-3 text-[0.95rem] font-medium leading-snug tracking-normal">{p.name}</h3>
                  <Price className="mt-1 block text-sm text-muted" value={p.minPrice} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
