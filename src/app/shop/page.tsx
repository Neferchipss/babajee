import ShopPano from "@/components/ShopPano";
import { getCategoriesWithCounts } from "@/lib/catalog-db";

// The category index: a 360° look around the shop, with the categories
// listed over it. The same in every theme; the box takes the theme's colours.
export default async function ShopPage() {
  const categories = await getCategoriesWithCounts();
  return <ShopPano categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} />;
}
