// GST and profit arithmetic, shared by the checkout, the order pages and the
// admin. It mirrors place_order() and admin_profit() in
// supabase/migrations/0015_cost_gst_profit.sql: change one, change both.
//
// GST is one rate on the whole cart. "Inclusive" means the shelf price already
// has it inside (₹118 at 18% is ₹100 + ₹18 GST); otherwise it is added on top
// at checkout. Shipping carries no GST here.

export type GstRules = {
  rate: number; // percent, e.g. 18
  inclusive: boolean;
  credit: boolean; // the shop claims back the GST on supplier bills
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// What the checkout bill shows for a cart worth `sub` on the shelf.
export function bill(sub: number, ship: number, g: Pick<GstRules, "rate" | "inclusive">) {
  const tax = g.inclusive ? round2((sub * g.rate) / (100 + g.rate)) : round2((sub * g.rate) / 100);
  return { sub, ship, tax, total: round2(sub + ship + (g.inclusive ? 0 : tax)) };
}

// One unit: the sale with GST taken out, the cost (without the supplier's GST
// when it is claimed back), the profit and the margin on the sale.
export function unitProfit(price: number, cost: number, g: GstRules) {
  const net = g.inclusive ? (price * 100) / (100 + g.rate) : price;
  const costEx = g.credit ? (cost * 100) / (100 + g.rate) : cost;
  const profit = net - costEx;
  return { net: round2(net), cost: round2(costEx), profit: round2(profit), margin: net > 0 ? (profit / net) * 100 : 0 };
}
