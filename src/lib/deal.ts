export type Deal = { price: number; mrp: number };

export function dealFor(price?: number, mrp?: number): Deal | null {
  return price !== undefined && mrp !== undefined && price < mrp ? { price, mrp } : null;
}
