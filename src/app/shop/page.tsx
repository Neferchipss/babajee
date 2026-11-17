import { withPageSeo } from "@/lib/catalog-db";
import type { Metadata } from "next";
import CategoryView from "@/components/CategoryView";
import { allShelfProducts } from "./all-products";

const META: Metadata = {
  title: "Shop all smoking accessories",
  description: "Every product at Babajee in one place: rolling papers, cones, trays, grinders, glass, bongs and accessories, with prices and stock. Delivered across India.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/shop/` },
};

// with the search listing from Admin > Storefront, when one is set
export async function generateMetadata(): Promise<Metadata> {
  return withPageSeo("/shop/", META);
}

// Every product in the shop, as one shelf: the categories in their order,
// each under its own heading.
export default async function ShopPage() {
  const { categories, products } = await allShelfProducts();
  return <CategoryView category={{ slug: "all", name: "All" }} categories={categories} products={products} />;
}
