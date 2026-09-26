import Link from "next/link";
import Page from "@/components/Page";
import { getCategoriesWithCounts } from "@/lib/catalog-db";
import { toneAt } from "@/lib/tone";

export default async function ShopPage() {
  const categories = await getCategoriesWithCounts();
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <Page title="Shop" lede={`Browse ${categories.length} categories and ${total} products.`}>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, i) => (
          <li key={category.slug}>
            <Link
              href={`/shop/${category.slug}`}
              className="tile flex min-h-40 flex-col justify-between p-6"
              style={{ "--tone": toneAt(i) } as React.CSSProperties}
            >
              <span className="text-sm text-muted">{category.count} products</span>
              <h2 className="text-2xl">{category.name}</h2>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
