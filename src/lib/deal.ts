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

// The stand-in price for a product that has none yet (shown as ₹420.00).
export const STAND_IN = 420;

// What one unit costs for display and sums: the real price, or until prices
// arrive, the stand-in deal or the stand-in price. mrp is set when it is on
// offer.
export function unitPrice(slug: string, price?: number, mrp?: number): { price: number; mrp?: number } {
  const deal = dealFor(slug, price, mrp);
  if (deal) return deal;
  return { price: price ?? STAND_IN };
}
