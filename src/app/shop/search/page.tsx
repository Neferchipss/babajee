import type { Metadata } from "next";
import { Suspense } from "react";
import SearchView from "@/components/SearchView";
import { getCategories, getSearchCatalog } from "@/lib/catalog-db";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  const [categories, products] = await Promise.all([getCategories(), getSearchCatalog()]);
  const indexBySlug = new Map(categories.map((c, i) => [c.slug, i]));

  const entries = products.map((p) => ({
    href: `/shop/${p.categorySlug}/${p.slug}`,
    name: p.name,
    options: p.variantCount > 1 ? p.variantCount - 1 : 0,
    price: p.minPrice,
    categoryIndex: indexBySlug.get(p.categorySlug) ?? 0,
    haystack: `${p.name} ${p.categoryName}`.toLowerCase(),
  }));

  return (
    <Suspense>
      <SearchView entries={entries} />
    </Suspense>
  );
}
