"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ADDED_EVENT, LANDED_EVENT, type CartItem } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { markStaffDevice, track } from "@/lib/track";

// Counts a page view on every route change, and an add to cart whenever
// something lands in Baba's jar (see src/lib/track.ts); every add is also
// recorded with the product's name, for the customer's activity.
export default function SiteTracker() {
  const path = usePathname();
  const { profile } = useAuth();
  const staff = profile?.role === "admin";
  useEffect(() => {
    if (staff) markStaffDevice();
  }, [staff]);
  useEffect(() => {
    track("view");
  }, [path]);
  useEffect(() => {
    const onAdd = () => track("cart");
    const onAdded = (e: Event) => {
      const it = (e as CustomEvent<CartItem & { qty: number }>).detail;
      if (!it) return;
      const option = it.variant && it.variant !== "Default" && it.variant !== "Standard" ? ` (${it.variant})` : "";
      track("add", it.href, `${it.qty > 1 ? `${it.qty} × ` : ""}${it.name}${option}`);
    };
    window.addEventListener(LANDED_EVENT, onAdd);
    window.addEventListener(ADDED_EVENT, onAdded);
    return () => {
      window.removeEventListener(LANDED_EVENT, onAdd);
      window.removeEventListener(ADDED_EVENT, onAdded);
    };
  }, []);
  return null;
}
