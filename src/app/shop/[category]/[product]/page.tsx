import type { Metadata } from "next";
import { getCategoryDetail, getSeoProduct, getShopTags, getStaticProductParams, getStaticTagParams } from "@/lib/catalog-db";
import { photosFor } from "@/lib/product-photos";
import { fullTitle, seoDescription, seoTitle, SITE_NAME } from "@/lib/seo";
import { absUrl } from "@/lib/site";
import Shelf from "../Shelf";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamicParams = false;

// each product's page, and each sub-category's (0063): they share the
// address space, and the database keeps their slugs apart
export async function generateStaticParams() {
  const [products, tags] = await Promise.all([getStaticProductParams(), getStaticTagParams()]);
  return [...products, ...tags];
}

// a sub-category of this category, when the slug is one (0063)
async function tagOf(category: string, slug: string) {
  const { byCategory } = await getShopTags();
  return (byCategory[category] ?? []).find((t) => t.slug === slug) ?? null;
}

// What Google and link previews (WhatsApp, Instagram) read for a product:
// its title, description, address and first photo.
export async function generateMetadata(props: PageProps<"/shop/[category]/[product]">): Promise<Metadata> {
  const { category, product } = await props.params;
  const p = await getSeoProduct(category, product);
  if (!p) {
    // a sub-category's page: "King Size Rolling Papers", and what's in it
    const t = await tagOf(category, product);
    const detail = t && (await getCategoryDetail(category));
    if (!t || !detail) return {};
    const title = t.seoTitle || `${t.name} ${detail.category.name}`;
    const description = t.seoDescription || `${t.name} ${detail.category.name.toLowerCase()} at Babajee, with prices and stock. Delivered across India.`;
    const url = `${BASE}/shop/${category}/${product}/`;
    return { title, description, alternates: { canonical: url }, openGraph: { title: fullTitle(title), description, url } };
  }
  const seo = { name: p.name, category: p.categoryName, description: p.description, brand: p.brand, price: p.minPrice, seoTitle: p.seoTitle, seoDescription: p.seoDescription };
  const title = seoTitle(seo);
  const description = seoDescription(seo);
  const url = `${BASE}/shop/${category}/${product}/`;
  const photo = photosFor(product)[0];
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: fullTitle(title), description, url, images: photo ? [{ url: photo, alt: p.name }] : undefined },
    twitter: { card: photo ? "summary_large_image" : "summary", title: fullTitle(title), description },
  };
}

// A product's own address: its shelf, with the product open on it (the
// address then reads as the shelf's, ?p=slug, as when opened from the shelf).
// Search engines also get the product as structured data: name, photos,
// price, stock and brand for the result, and where it sits in the shop.
export default async function ProductPage(props: PageProps<"/shop/[category]/[product]">) {
  const { category, product } = await props.params;
  const p = await getSeoProduct(category, product);
  if (!p) {
    const t = await tagOf(category, product);
    if (t) {
      const detail = await getCategoryDetail(category);
      const crumbs = detail && {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Shop", item: absUrl("/shop/") },
          { "@type": "ListItem", position: 2, name: detail.category.name, item: absUrl(`/shop/${category}/`) },
          { "@type": "ListItem", position: 3, name: t.name, item: absUrl(`/shop/${category}/${product}/`) },
        ],
      };
      return (
        <>
          {crumbs && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />}
          <Shelf categorySlug={category} tag={product} />
        </>
      );
    }
  }
  const url = absUrl(`/shop/${category}/${product}/`);
  const data = p && [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: seoDescription({ name: p.name, category: p.categoryName, description: p.description, brand: p.brand, price: p.minPrice, seoDescription: p.seoDescription }),
      image: photosFor(product).slice(0, 6).map(absUrl),
      url,
      category: p.categoryName,
      ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
      ...(p.minPrice
        ? {
            offers: {
              "@type": p.maxPrice && p.maxPrice !== p.minPrice ? "AggregateOffer" : "Offer",
              priceCurrency: "INR",
              ...(p.maxPrice && p.maxPrice !== p.minPrice ? { lowPrice: p.minPrice, highPrice: p.maxPrice } : { price: p.minPrice }),
              availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url,
              seller: { "@type": "Organization", name: SITE_NAME },
            },
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Shop", item: absUrl("/shop/") },
        { "@type": "ListItem", position: 2, name: p.categoryName, item: absUrl(`/shop/${category}/`) },
        { "@type": "ListItem", position: 3, name: p.name, item: url },
      ],
    },
  ];
  return (
    <>
      {data && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />}
      <Shelf categorySlug={category} open={product} />
    </>
  );
}
