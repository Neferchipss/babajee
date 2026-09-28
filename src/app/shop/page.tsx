import Link from "next/link";
import CategoryIcon from "@/components/CategoryIcon";
import DaydreamGarden from "@/components/DaydreamGarden";
import DaydreamMark from "@/components/DaydreamMark";
import { getCategoriesWithCounts } from "@/lib/catalog-db";
import { toneAt } from "@/lib/tone";

// The category index. Same markup in every theme; Refined reads it as a
// numbered ledger, Daydream as a garden.
export default async function ShopPage() {
  const categories = await getCategoriesWithCounts();
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="si">
      <section className="si-hero" aria-labelledby="si-title">
        <p className="si-crumb">Babajee &middot; The smoke shop</p>
        <h1 id="si-title" className="si-title">
          <span className="dd-original-title">Shop</span>
          <span className="dd-shop-title">Little things.<br /><em>Brighter days.</em></span>
        </h1>
        <p className="si-tag">Good tools. Brighter days.</p>
        <p className="si-lede">
          {categories.length} categories &middot; {total} products
        </p>
        <DaydreamGarden categories={categories} />
      </section>

      <ul className="si-grid">
        {categories.map((category, i) => (
          <li key={category.slug}>
            <Link
              href={`/shop/${category.slug}`}
              className="si-card"
              style={{ "--tone": toneAt(i) } as React.CSSProperties}
            >
              <span className="si-num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="si-ico dd-original-icon" aria-hidden="true">
                <CategoryIcon slug={category.slug} />
              </span>
              <span className="si-ico dd-category-mark" aria-hidden="true"><DaydreamMark variant={i % 4} /></span>
              <span className="si-name">{category.name}</span>
              <span className="si-count">
                {category.count} {category.count === 1 ? "product" : "products"}
              </span>
              <span className="si-go" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
