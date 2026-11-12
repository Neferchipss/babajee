import type { Metadata } from "next";
import { Suspense } from "react";
import CollectionShelf from "@/components/CollectionShelf";
import { getCategoriesWithCounts } from "@/lib/catalog-db";

// A collection's shelf (0041): /shop/collections?c=staff-picks. One page for
// every collection, filled in the browser, so a collection the shop makes
// shows at once, without the site being rebuilt.
export const metadata: Metadata = { title: "Collections", robots: { index: false } };

export default async function CollectionsPage() {
  const categories = await getCategoriesWithCounts();
  return (
    <Suspense>
      <CollectionShelf categories={categories} />
    </Suspense>
  );
}
