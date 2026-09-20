// Prices don't exist yet (the stock sheet has none). Swap this for a real
// value once the client sends them.
export default function Price({ className = "" }: { className?: string }) {
  return <span className={`tabular-nums ${className}`}>Rs.xx.xx</span>;
}
