/**
 * Average buying price after receiving stock. Mirrors the database rule:
 * new = (max(stock,0) * avg + qty * price) / (max(stock,0) + qty), to the paisa.
 * No average yet counts as the incoming price; qty 0 leaves the average alone.
 */
export function nextAverage(
  stock: number,
  avg: number | null,
  qty: number,
  price: number,
): number {
  if (qty === 0) return avg ?? price;
  // Postgres numeric rounds half away from zero; the epsilon absorbs float noise on exact ties.
  const paisa = (x: number) => (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-7)) / 100;
  const held = Math.max(stock, 0);
  const base = avg ?? price;
  const total = held + qty;
  if (total === 0) return paisa(price);
  return paisa((held * base + qty * price) / total);
}
