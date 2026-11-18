// One buyable option of a product, as the product card and sheet list them.
export type BuyVariant = { label: string; price?: number; stockQty: number; pack?: number };

// a box option's price per piece, "₹9 each" (nothing for a loose option)
export function eachText(v: { price?: number; pack?: number }, fmt: (n: number) => string) {
  return v.pack && v.price ? `${fmt(Math.round((v.price / v.pack) * 100) / 100)} each` : "";
}
