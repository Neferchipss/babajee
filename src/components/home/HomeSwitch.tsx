"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import PanoLanding from "@/components/PanoLanding";
import { DESIGNS, getLook, type Design } from "@/lib/content";
import type { HomeProduct } from "@/lib/catalog-db";
import ShopHome from "./ShopHome";

// The homepage in the design the shop has picked (Admin > Storefront, 0073):
// Current is the painted walk-in (PanoLanding), the others are ShopHome.
// ?design=<id> shows any one to look at before switching. The last design
// seen is remembered in this browser so a return visit starts in it.
const KEY = "bj-design";
type PanoProps = React.ComponentProps<typeof PanoLanding>;
const known = (d: string | null): d is Design => !!d && DESIGNS.some((x) => x.id === d);
const never = () => () => {};
const askedNow = () => {
  const d = new URLSearchParams(location.search).get("design");
  return known(d) ? d : null;
};
const savedNow = () => {
  try {
    const d = localStorage.getItem(KEY);
    return known(d) ? d : null;
  } catch {
    return null;
  }
};

export default function HomeSwitch({ pano, products }: { pano: PanoProps; products: HomeProduct[] }) {
  const asked = useSyncExternalStore(never, askedNow, () => null);
  const saved = useSyncExternalStore(never, savedNow, () => null);
  const [picked, setPicked] = useState<Design | null>(null);
  useEffect(() => {
    let live = true;
    getLook().then((l) => {
      if (!live) return;
      setPicked(l.design);
      try {
        localStorage.setItem(KEY, l.design);
      } catch {}
    });
    return () => {
      live = false;
    };
  }, []);

  // before it's known (the first paint of a static page): the painted shop,
  // as the page has always opened
  const design = asked ?? picked ?? saved;
  if (design === null || design === "current") return <PanoLanding {...pano} />;
  return <ShopHome design={design} products={products} categories={pano.categories} />;
}
