import ShopScene from "@/components/ShopScene";
import { getIndexCategories } from "@/lib/catalog-db";

// The landing: the storefront, then scrolling walks you in to the shop floor.
export default async function Home() {
  const categories = await getIndexCategories();
  return <ShopScene intro categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} />;
}
