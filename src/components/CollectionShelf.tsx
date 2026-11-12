"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import CategoryView from "./CategoryView";

type Found = { slug: string; name: string; tagline: string; slugs: string[] } | "missing" | null;

// The shelf of the collection named in the address (?c=staff-picks): its
// name, its line, and its products in the order the shop set.
export default function CollectionShelf({ categories }: { categories: { slug: string; name: string; count: number }[] }) {
  const slug = useSearchParams().get("c") ?? "";
  const [found, setFound] = useState<{ for: string; c: Found }>({ for: "", c: null });

  useEffect(() => {
    let live = true;
    import("@/lib/collections")
      .then((m) => m.listCollections())
      .then((l) => {
        const c = l.find((x) => x.slug === slug && x.is_visible);
        if (live) setFound({ for: slug, c: c ? { slug: c.slug, name: c.name, tagline: c.tagline, slugs: c.product_slugs } : "missing" });
      })
      .catch(() => live && setFound({ for: slug, c: "missing" }));
    return () => {
      live = false;
    };
  }, [slug]);

  const c = found.for === slug ? found.c : null;
  const category =
    c === "missing"
      ? { slug: `collection:${slug}`, name: "Not found", tagline: "This collection isn't on the shop any more." }
      : { slug: `collection:${slug}`, name: c?.name ?? "", tagline: c?.tagline ?? "" };
  return <CategoryView key={slug} category={category} categories={categories} products={[]} pick={c && c !== "missing" ? c.slugs : []} />;
}
