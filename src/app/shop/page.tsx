import ShopScene from "@/components/ShopScene";
import { getIndexCategories } from "@/lib/catalog-db";

// The category index: the inside of the shop, as the landing's walk ends,
// with the categories listed over it. The same in every theme; the box takes
// the theme's colours.
export default async function ShopPage() {
  const categories = await getIndexCategories();
  return <ShopScene intro={false} categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} />;
}
