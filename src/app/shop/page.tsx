import Link from "next/link";
import Page from "@/components/Page";
import { CATEGORIES } from "@/lib/catalog-data";
import { toneAt } from "@/lib/tone";

export default function ShopPage() {
  const total = CATEGORIES.reduce((sum, c) => sum + c.products.length, 0);

  return (
    <Page title="Shop" lede={`Browse ${CATEGORIES.length} categories and ${total} products.`}>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category, i) => (
          <li key={category.slug}>
            <Link
              href={`/shop/${category.slug}`}
              className="tile flex min-h-40 flex-col justify-between p-6"
              style={{ "--tone": toneAt(i) } as React.CSSProperties}
            >
              <span className="text-sm text-muted">{category.products.length} products</span>
              <h2 className="text-2xl">{category.name}</h2>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
