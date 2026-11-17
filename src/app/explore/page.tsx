import type { Metadata } from "next";
import PanoLanding from "@/components/PanoLanding";
import { getIndexCategories, getShelfPicks } from "@/lib/catalog-db";

export const metadata: Metadata = {
  title: "Explore the shop",
  description: "Walk into the painted Babajee shop: shelves, jars and all.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/explore/` },
};

// The painted walk-in on its own address, for the storefront designs'
// "Explore the shop" button (the homepage itself when the design is Current).
export default async function ExplorePage() {
  const categories = await getIndexCategories();
  const shelves = await getShelfPicks(categories.map((c) => c.slug));
  return <PanoLanding shelves={shelves} categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} />;
}
