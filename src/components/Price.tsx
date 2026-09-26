import { formatPrice } from "@/lib/currency";

// With a value, shows the real price. Without one, shows the placeholder —
// still used where a real price doesn't exist yet (the demo cart/checkout).
export default function Price({ value, className = "" }: { value?: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{value === undefined ? "Rs.xx.xx" : formatPrice(value)}</span>;
}
