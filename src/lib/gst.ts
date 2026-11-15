// GST and profit arithmetic, shared by the checkout, the order pages and the
// admin. It mirrors place_order(), order_retax() and admin_profit() in
// supabase/migrations/0030_gst_brackets.sql: change one, change both.
//
// Each product sits in a GST bracket (5, 12, 18, 28 or 40%, or the store's
// default). "Inclusive" (one switch for the whole shop) means the shelf price
// already has it inside (₹118 at 18% is ₹100 + ₹18 GST); otherwise it is
// added on top at checkout. GST is worked out line by line, each line rounded
// to the paisa. Shipping carries no GST here.

export const GST_BRACKETS = [0, 5, 12, 18, 28, 40] as const;

export type GstRules = {
  rate: number; // percent, e.g. 18
  inclusive: boolean;
  credit: boolean; // the shop claims back the GST on supplier bills
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// GST on a line worth `gross` on the shelf
export function lineGst(gross: number, rate: number, inclusive: boolean) {
  return inclusive ? round2((gross * rate) / (100 + rate)) : round2((gross * rate) / 100);
}

// What the bill shows: lines are { gross: price x qty, rate }.
export function bill(lines: { gross: number; rate: number }[], ship: number, inclusive: boolean) {
  const sub = round2(lines.reduce((n, l) => n + l.gross, 0));
  const tax = round2(lines.reduce((n, l) => n + lineGst(l.gross, l.rate, inclusive), 0));
  const rates = [...new Set(lines.filter((l) => l.gross > 0).map((l) => l.rate))];
  return { sub, ship, tax, total: round2(sub + ship + (inclusive ? 0 : tax)), rate: rates.length === 1 ? rates[0] : null };
}

// "Includes GST (18%)", "GST (5%)", or without the % when lines differ
export function gstLabel(inclusive: boolean, rate: number | null | undefined) {
  return `${inclusive ? "Includes GST" : "GST"}${rate != null ? ` (${rate}%)` : ""}`;
}

// One unit, as the client counts it:
//   cost   = purchase price + GST (the cost price)
//   sale   = selling price with GST
//   profit = sale - cost
// and what is left once the GST owed is paid (kept): the sale without GST,
// less the cost (without its GST only when that GST is claimed back).
export function unitProfit(price: number, cost: number, g: GstRules) {
  const sale = g.inclusive ? price : (price * (100 + g.rate)) / 100;
  const net = (sale * 100) / (100 + g.rate);
  const profit = sale - cost;
  const kept = net - (g.credit ? (cost * 100) / (100 + g.rate) : cost);
  return { sale: round2(sale), net: round2(net), cost: round2(cost), profit: round2(profit), kept: round2(kept), margin: sale > 0 ? (profit / sale) * 100 : 0 };
}

// cost price from a purchase price (before GST)
export const costOf = (purchase: number, rate: number) => round2((purchase * (100 + rate)) / 100);
