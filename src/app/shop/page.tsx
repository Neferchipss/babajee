import CategoryView from "@/components/CategoryView";
import { allShelfProducts } from "./all-products";

// Every product in the shop, as one shelf: the categories in their order,
// each under its own heading.
export default async function ShopPage() {
  const { categories, products } = await allShelfProducts();
  return <CategoryView category={{ slug: "all", name: "All" }} categories={categories} products={products} />;
}
