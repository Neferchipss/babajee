import type { Metadata } from "next";
import CategoryView from "@/components/CategoryView";
import { allShelfProducts } from "../all-products";

export const metadata: Metadata = { title: "Search" };

// Search: the all-products shelf, narrowed live by the search bar (the
// query arrives in ?q=). Same header, categories and product sheet as any
// shelf.
export default async function SearchPage() {
  const { categories, products } = await allShelfProducts();
  return <CategoryView category={{ slug: "search", name: "Search" }} categories={categories} products={products} />;
}
