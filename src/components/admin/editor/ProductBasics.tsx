"use client";

import { type adminApi } from "@/lib/admin-api";
import { type AdminProduct, type ProductStatus } from "@/lib/admin-data";
import { photosFor } from "@/lib/product-photos";

export type Api = ReturnType<typeof adminApi>;
// What a product still needs before it can sell: a photo, a price, to be shown.
export function needsOf(p: AdminProduct) {
  return {
    photo: p.images.length === 0 && photosFor(p.slug).length === 0,
    price: !p.variants.some((v) => v.price > 0),
    hidden: p.status === "draft",
  };
}
export const STATUSES: [ProductStatus, string, string][] = [
  ["draft", "Draft", "Being prepared: not on the shop yet"],
  ["published", "On the shop", "Customers can see and buy it"],
  ["archived", "Archived", "Retired: off the shop and out of the everyday list, kept with its orders"],
];
export const needsWork = (p: AdminProduct) => Object.values(needsOf(p)).some(Boolean);
// A product's main price: the one its options share (the most common; a price
// over none). Options follow it unless one is given a price of its own.
export function mainPrice(p: AdminProduct): number {
  const tally = new Map<number, number>();
  for (const v of p.variants) if (v.price > 0) tally.set(v.price, (tally.get(v.price) ?? 0) + 1);
  let best = 0;
  let n = 0;
  for (const [price, k] of tally) if (k > n) [best, n] = [price, k];
  return best;
}
// The main price changed: every option on the old main price, or with none
// yet, moves with it; an option with its own price keeps it.
export async function setMainPrice(api: Api, p: AdminProduct, price: number) {
  const old = mainPrice(p);
  await Promise.all(p.variants.filter((v) => v.price === old || v.price === 0).map((v) => api.upsertVariant(p.id, { ...v, price })));
}
