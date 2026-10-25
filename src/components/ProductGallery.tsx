"use client";

import { useEffect, useState } from "react";
import { OPTION_EVENT, photosFor } from "@/lib/product-photos";
import ProductArt from "./ProductArt";

// The product page's photos: a strip to swipe through, showing the photos of
// the option chosen beside it (ProductBuy tells it), else the first's.
export default function ProductGallery({ slug, name, tone }: { slug: string; name: string; tone: string }) {
  const [option, setOption] = useState<string | undefined>(undefined);
  useEffect(() => {
    const on = (e: Event) => setOption((e as CustomEvent<string>).detail);
    window.addEventListener(OPTION_EVENT, on);
    return () => window.removeEventListener(OPTION_EVENT, on);
  }, []);
  const photos = photosFor(slug, option);
  if (photos.length < 2) return <ProductArt name={name} tone={tone} slug={slug} option={option} />;
  return (
    <div key={option} className="pc-slides pd-slides" data-many>
      {photos.map((src, k) => (
        <div key={src} className="pc-slide">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={k === 0 ? name : ""} className="pa pc-photo" loading={k ? "lazy" : "eager"} draggable={false} />
        </div>
      ))}
    </div>
  );
}
