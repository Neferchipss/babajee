// A price that is down from a higher one (the struck-through "MRP").
export type Deal = { price: number; mrp: number };

// Until the client's prices arrive, about one product in four shows a
// stand-in deal, ₹42.00 down from ₹420.00. Picked from the slug, so the same
// products are on offer on every render, on every device.
export function placeholderDeal(slug?: string): Deal | null {
  if (!slug) return null;
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 4 === 0 ? { price: 42, mrp: 420 } : null;
}

// a real deal when both prices are known and the price is lower; otherwise
// the stand-in, only where there is no price at all yet
export function dealFor(slug: string | undefined, price?: number, mrp?: number): Deal | null {
  if (price !== undefined) return mrp !== undefined && price < mrp ? { price, mrp } : null;
  return placeholderDeal(slug);
}
