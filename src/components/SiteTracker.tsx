"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LANDED_EVENT } from "@/lib/cart";
import { track } from "@/lib/track";

// Counts a page view on every route change, and an add to cart whenever
// something lands in Baba's jar (see src/lib/track.ts).
export default function SiteTracker() {
  const path = usePathname();
  useEffect(() => {
    track("view");
  }, [path]);
  useEffect(() => {
    const onAdd = () => track("cart");
    window.addEventListener(LANDED_EVENT, onAdd);
    return () => window.removeEventListener(LANDED_EVENT, onAdd);
  }, []);
  return null;
}
