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
  const held = Math.max(stock, 0);
  const base = avg ?? price;
  const total = held + qty;
  if (total === 0) return Math.round(price * 100) / 100;
  return Math.round(((held * base + qty * price) / total) * 100) / 100;
}
