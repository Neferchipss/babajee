import LostPage from "@/components/LostPage";
import { getIndexCategories } from "@/lib/catalog-db";

// Any address that isn't a page (exported as 404.html for GitHub Pages).
export default async function NotFound() {
  const categories = await getIndexCategories();
  return <LostPage categories={categories.map(({ slug, name }) => ({ slug, name }))} />;
}
