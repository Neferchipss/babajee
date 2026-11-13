"use client";

import type { CartLine } from "./cart";
import { UNCOUNTED } from "./catalog-db";
import { useLiveCatalog } from "./useLiveCatalog";

// The cart against the shop's stock right now. A line can have sold out
// since it went in the jar, or be asking for more than are left. Only
// options whose stock is counted can be short (catalog-db stockOf); while
// the live catalogue is loading, nothing is flagged.
export type LineStock = { out: true } | { left: number } | null;

export function useCartStock(cart: CartLine[]) {
  const catalog = useLiveCatalog();
  const of = new Map<string, LineStock>();
  if (catalog) {
    const bySlug = new Map(catalog.map((p) => [p.slug, p]));
    for (const l of cart) {
      const p = bySlug.get(l.slug);
      const v = p?.variants.find((x) => x.label === l.variant) ?? (p?.variants.length === 1 ? p.variants[0] : undefined);
      if (!v || v.stockQty >= UNCOUNTED) continue;
      if (v.stockQty <= 0) of.set(l.key, { out: true });
      else if (l.qty > v.stockQty) of.set(l.key, { left: v.stockQty });
    }
  }
  // the first thing in the way of checking out, said plainly
  const first = cart.find((l) => of.get(l.key));
  const blocked = first
    ? (() => {
        const s = of.get(first.key)!;
        return "out" in s
          ? `${first.name} is out of stock. Remove it to check out.`
          : `Only ${s.left} of ${first.name} left. Lower the quantity to check out.`;
      })()
    : "";
  return { of, blocked };
}
