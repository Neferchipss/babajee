import type { Metadata } from "next";
import { getSeoProduct, getStaticProductParams } from "@/lib/catalog-db";
import { photosFor } from "@/lib/product-photos";
import { fullTitle, seoDescription, seoTitle } from "@/lib/seo";
import OpenInShelf from "./OpenInShelf";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getStaticProductParams();
}

// What Google and link previews (WhatsApp, Instagram) read for a product:
// its title, description, address and first photo. They read this page's
// HTML before any script runs, so the listing is here even though people
// are sent on to the shelf.
export async function generateMetadata(props: PageProps<"/shop/[category]/[product]">): Promise<Metadata> {
  const { category, product } = await props.params;
  const p = await getSeoProduct(category, product);
  if (!p) return {};
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

// There is no page of its own for a product: it opens in the sheet on its
// shelf. This address is kept for links made before (carts and wishlists
// saved in the browser, shared links), and sends them on to the shelf.
export default async function ProductPage(props: PageProps<"/shop/[category]/[product]">) {
  const { category, product } = await props.params;
  return <OpenInShelf href={`/shop/${category}?p=${encodeURIComponent(product)}`} />;
}
