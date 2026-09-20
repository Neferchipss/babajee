import Link from "next/link";
import PageShell from "@/components/PageShell";
import { CATEGORIES } from "@/lib/catalog-data";

export default function ShopPage() {
  return (
    <PageShell title="Categories" sow="Product Catalogue — SOW #4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {CATEGORIES.map((category) => (
          <Link
            key={category.slug}
            href={`/shop/${category.slug}`}
            className="flex aspect-square flex-col justify-end rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <span className="font-medium">{category.name}</span>
            <span className="text-xs text-neutral-500">
              {category.products.length} products
            </span>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
