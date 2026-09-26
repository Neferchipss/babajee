// Postgres numeric columns come back from the database as strings (Postgrest
// avoids float rounding), so every price/stock value passing through here is
// coerced with Number() before use.
export function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function formatPrice(value: unknown): string {
  return `Rs.${toNumber(value).toFixed(2)}`;
}
