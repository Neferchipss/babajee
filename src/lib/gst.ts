// GST and profit arithmetic, shared by the checkout, the order pages and the
// admin. It mirrors place_order(), order_retax() and admin_profit() in
// supabase/migrations/0030_gst_brackets.sql: change one, change both.
//
// Each product sits in a GST bracket (5, 12, 18, 28 or 40%, or the store's
// default). "Inclusive" (one switch for the whole shop) means the shelf price
// already has it inside (₹118 at 18% is ₹100 + ₹18 GST); otherwise it is
// added on top at checkout. GST is worked out line by line, each line rounded
// to the paisa. Shipping carries no GST here.
//
// CESS (0060, off unless switched on in Settings) sits on the same taxable
// value as GST: inside an inclusive price (price = taxable + GST + cess), or
// added on top. With no cess the GST is worked out exactly as before.

export const GST_BRACKETS = [0, 5, 12, 18, 28, 40] as const;

export type GstRules = {
  rate: number; // percent, e.g. 18
  inclusive: boolean;
  credit: boolean; // the shop claims back the GST on supplier bills
  cess?: number; // percent on the taxable value (0060), 0 or absent: none
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// GST on a line worth `gross` on the shelf (line_gst_c() in 0060)
export function lineGst(gross: number, rate: number, inclusive: boolean, cess = 0) {
  if (!cess) return inclusive ? round2((gross * rate) / (100 + rate)) : round2((gross * rate) / 100);
  return inclusive ? round2((gross * rate) / (100 + rate + cess)) : round2((gross * rate) / 100);
}

// cess on the same line (line_cess() in 0060)
export function lineCess(gross: number, rate: number, cess: number, inclusive: boolean) {
  if (!cess) return 0;
  return inclusive ? round2((gross * cess) / (100 + rate + cess)) : round2((gross * cess) / 100);
}

// What the bill shows: lines are { gross: price x qty, rate, cess }.
export function bill(lines: { gross: number; rate: number; cess?: number }[], ship: number, inclusive: boolean) {
  const sub = round2(lines.reduce((n, l) => n + l.gross, 0));
  const tax = round2(lines.reduce((n, l) => n + lineGst(l.gross, l.rate, inclusive, l.cess ?? 0), 0));
  const cess = round2(lines.reduce((n, l) => n + lineCess(l.gross, l.rate, l.cess ?? 0, inclusive), 0));
  const rates = [...new Set(lines.filter((l) => l.gross > 0).map((l) => l.rate))];
  return { sub, ship, tax, cess, total: round2(sub + ship + (inclusive ? 0 : tax + cess)), rate: rates.length === 1 ? rates[0] : null };
}

// "Includes GST (18%)", "GST (5%)", or without the % when lines differ
export function gstLabel(inclusive: boolean, rate: number | null | undefined) {
  return `${inclusive ? "Includes GST" : "GST"}${rate != null ? ` (${rate}%)` : ""}`;
}

// One unit, as the client counts it:
//   cost   = purchase price + GST paid to the supplier (the cost price)
//   sale   = selling price with GST
//   profit = sale - cost
// and what is left once the GST owed is paid (kept): the sale without GST,
// less the cost, less the GST paid to the supplier that is claimed back.
// `paid` is the GST paid to the supplier per piece (without it, it is
// estimated at the selling rate), `claimable` the part of it that can be
// claimed back (all of it unless said); nothing is claimed with credit off.
// `supplier` may also be just the GST paid, as a number (0057's callers).
// Mirrors admin_profit() in supabase/migrations/0059_supplier_gst_profit.sql.
export function unitProfit(price: number, cost: number, g: GstRules, gst?: number | null | { paid?: number | null; claimable?: number | null }) {
  const supplier = typeof gst === "number" ? { paid: gst } : (gst ?? undefined);
  const c = g.cess ?? 0;
  const sale = g.inclusive ? price : (price * (100 + g.rate + c)) / 100;
  const net = (sale * 100) / (100 + g.rate + c);
  const profit = sale - cost;
  const paid = supplier?.paid ?? (cost * g.rate) / (100 + g.rate);
  const itc = g.credit ? Math.min(supplier?.claimable ?? paid, paid) : 0;
  const kept = net - (cost - itc);
  const collected = (net * g.rate) / 100;
  const cess = (net * c) / 100;
  return {
    sale: round2(sale),
    net: round2(net),
    cost: round2(cost),
    profit: round2(profit),
    kept: round2(kept),
    margin: sale > 0 ? (profit / sale) * 100 : 0,
    // the GST story behind kept
    collected: round2(collected), // GST collected from the buyer
    cess: round2(cess), // cess collected from the buyer, all paid over
    paid: round2(paid), // GST paid to the supplier
    itc: round2(itc), // of that, claimed back
    owed: round2(collected - itc), // GST paid over to the government
    keptNoItc: round2(net - cost), // kept, had nothing been claimed back
    estimated: supplier?.paid == null, // GST paid worked out at the selling rate
  };
}

// cost price from a purchase price (before GST)
export const costOf = (purchase: number, rate: number) => round2((purchase * (100 + rate)) / 100);

// GST paid to the supplier per piece: the amount typed wins, else the rate
// typed, else the product's own bracket. Mirrors variant_costs_from_purchase().
export const supplierGst = (purchase: number, rate: number, amount?: number | null) => (amount != null ? round2(amount) : round2((purchase * rate) / 100));
