// Postgres numeric columns come back from the database as strings (Postgrest
// avoids float rounding), so every price/stock value passing through here is
// coerced with Number() before use.
export function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

// Rupees with the ₹ sign and Indian digit grouping (₹1,24,999); paise only
// when there are any (₹29, ₹29.50).
const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const INR2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// paise: true always shows them (₹42.00)
export function formatPrice(value: unknown, { paise = false } = {}): string {
  const n = toNumber(value);
  if (paise) return `₹${INR2.format(n)}`;
  const s = INR.format(n);
  return `₹${/\.\d$/.test(s) ? `${s}0` : s}`;
}
