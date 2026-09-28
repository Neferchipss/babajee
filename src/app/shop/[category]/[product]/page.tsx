import Link from "next/link";
import { notFound } from "next/navigation";
import ProductArt from "@/components/ProductArt";
import ProductBuy from "@/components/ProductBuy";
import ProductCard from "@/components/ProductCard";
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
    <div className="pd">
      <nav aria-label="Breadcrumb" className="pd-crumb">
        <Link href="/shop">Shop</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/shop/${category.slug}`}>{category.name}</Link>
      </nav>

      <div className="pd-main">
        <div className="pd-media">
          <ProductArt name={product.name} tone={tone} />
        </div>

        <div className="pd-info">
          <p className="pd-cat">{category.name}</p>
          <h1 className="pd-title">{product.name}</h1>
          {product.description && <p className="pd-desc">{product.description}</p>}
          <ProductBuy variants={product.variants} />
        </div>
      </div>

      {more.length > 0 && (
        <section className="pd-more" aria-labelledby="more-heading">
          <div className="pd-more-head">
            <h2 id="more-heading" className="pd-more-title">
              More in {category.name}
            </h2>
            <Link href={`/shop/${category.slug}`} className="pd-more-all">
              See all
            </Link>
          </div>
          <ul className="cp-grid">
            {more.map((p) => (
              <ProductCard
                key={p.slug}
                product={{
                  href: `/shop/${category.slug}/${p.slug}`,
                  name: p.name,
                  options: p.variantCount > 1 ? p.variantCount - 1 : 0,
                  price: p.minPrice,
                  tone,
                }}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
