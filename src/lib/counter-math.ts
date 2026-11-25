// The till's sums (components/admin/counter): what a ticket comes to, what a
// discount does to a price, what the customer has paid and the change, and
// the GST lines on a receipt. Plain functions, so they're tested on their own
// (counter-math.test.ts) and agree with counter_sale() in
// supabase/migrations/0085_counter_sales.sql.
import { round2 } from "./currency.ts";

export type TillRules = {
  // store_settings.counter_*: may staff lower a price (discounts), how far,
  // and may they type any price at all
  discounts: boolean;
  maxDiscount: number;
  priceChange: boolean;
};

// a price after a percent off, to the paisa
export const discounted = (price: number, pct: number) => round2(price * (1 - Math.min(100, Math.max(0, pct)) / 100));

// percent off a list price (0 when there's no list price)
export const pctOff = (list: number, price: number) => (list > 0 ? round2(((list - price) * 100) / list) : 0);

// Why the till won't take this price for an item listed at `list`, or null
// when it's fine. The database checks the same (0085), so this only says it
// sooner.
export function priceProblem(list: number, price: number, r: TillRules): string | null {
  if (!(price > 0)) return "Type a price above zero.";
  if (!(list > 0) || price === list) return null;
  if (!r.priceChange && !(r.discounts && price < list)) return "Prices can't be changed at the counter (Settings › Counter).";
  if (price < list && !r.priceChange && pctOff(list, price) > r.maxDiscount + 0.005) return `That's ${pctOff(list, price)}% off; the counter allows ${r.maxDiscount}% at most.`;
  return null;
}

// The ticket's items with an order discount (percent) spread over every line,
// each price kept to the paisa.
export function withOrderDiscount<T extends { price: number }>(lines: T[], pct: number): T[] {
  if (!(pct > 0)) return lines;
  return lines.map((l) => ({ ...l, price: discounted(l.price, pct) }));
}

// A percent that takes `amount` off a ticket worth `sub` (for "₹50 off").
export const pctForAmount = (sub: number, amount: number) => (sub > 0 ? Math.min(100, Math.max(0, (amount * 100) / sub)) : 0);

// What's been paid against what's due. Anything over has to be cash: that's
// the change. Mirrors counter_sale()'s check.
export function settle(due: number, pays: { method: string; amount: number }[], cashMethod: string) {
  const paid = round2(pays.reduce((n, p) => n + (p.amount > 0 ? p.amount : 0), 0));
  const cash = round2(pays.filter((p) => p.method.toLowerCase() === cashMethod.toLowerCase()).reduce((n, p) => n + (p.amount > 0 ? p.amount : 0), 0));
  const short = round2(Math.max(0, due - paid));
  const over = round2(Math.max(0, paid - due));
  // over-paying by card or UPI can't be given back as change
  const ok = short < 0.005 && over <= cash + 0.005;
  return { paid, cash, short, change: ok ? over : 0, ok, overNotCash: over > cash + 0.005 };
}

// Notes a customer is likely to hand over for `due`: the exact amount, then
// the next round amounts up, to tap instead of typing.
export function quickCash(due: number): number[] {
  if (!(due > 0)) return [];
  const out = new Set<number>([round2(due)]);
  for (const step of [10, 50, 100, 500, 2000]) {
    const up = Math.ceil(due / step) * step;
    if (up > due) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

// The GST lines a receipt prints: per rate, the taxable value and the tax
// split half and half as CGST and SGST (a counter sale is in the shop's own
// state). Inclusive prices hold the GST; exclusive ones add it.
export function gstSummary(lines: { gross: number; rate: number }[], inclusive: boolean) {
  const by = new Map<number, number>();
  for (const l of lines) by.set(l.rate, (by.get(l.rate) ?? 0) + l.gross);
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, gross]) => {
      const taxable = round2(inclusive ? (gross * 100) / (100 + rate) : gross);
      const tax = round2(inclusive ? gross - taxable : (gross * rate) / 100);
      const cgst = round2(tax / 2);
      return { rate, taxable, tax, cgst, sgst: round2(tax - cgst) };
    });
}

// "Split evenly by N": N equal payments of a total, in paise, the last one
// taking the odd paise so they add up exactly (2 to 12 ways)
export function evenly(total: number, n: number): number[] {
  const k = Math.max(1, Math.min(12, Math.floor(n) || 1));
  const paise = Math.round(total * 100);
  const part = Math.floor(paise / k);
  return Array.from({ length: k }, (_, i) => (i === k - 1 ? paise - part * (k - 1) : part) / 100);
}
