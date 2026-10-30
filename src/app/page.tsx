import ShopScene from "@/components/ShopScene";
import { getIndexCategories, getShelfPicks } from "@/lib/catalog-db";

// The landing: the storefront, then scrolling walks you in to the shop floor.
export default async function Home() {
  const categories = await getIndexCategories();
  const shelves = await getShelfPicks(categories.map((c) => c.slug));
  return <ShopScene intro shelves={shelves} categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} />;
}
