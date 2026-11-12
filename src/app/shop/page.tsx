import type { Metadata } from "next";
import CategoryView from "@/components/CategoryView";
import { allShelfProducts } from "./all-products";

export const metadata: Metadata = {
  title: "Shop all smoking accessories",
  description: "Every product at Babajee in one place: rolling papers, cones, trays, grinders, glass, bongs and accessories, with prices and stock. Delivered across India.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/shop/` },
};

// Every product in the shop, as one shelf: the categories in their order,
// each under its own heading.
export default async function ShopPage() {
  const { categories, products } = await allShelfProducts();
  return <CategoryView category={{ slug: "all", name: "All" }} categories={categories} products={products} />;
}
