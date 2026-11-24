import { useSyncExternalStore } from "react";
import { tillReport, type TillReportKind } from "./counter";

// The till's reports (0086) in Reporting: which kinds they are, and the two
// filters they take beyond the dates, Channel (online, counter or both) and
// Cashier (one staff member). The filter is shared by both report screens
// and read by report() (orders/insights.ts) for these kinds.
export const TILL_KINDS: TillReportKind[] = [
  "daily",
  "hourly",
  "hourly_groups",
  "pay_types",
  "pay_users",
  "pay_customers",
  "users",
  "items",
  "till_refunds",
  "unpaid",
  "collected",
  "floats",
  "cash_moves",
  "voids",
  "discounts",
  "item_discounts",
];
// the ones about sales, where a channel means something
export const CHANNEL_KINDS: TillReportKind[] = ["daily", "hourly", "hourly_groups", "pay_types", "pay_users", "pay_customers", "users", "items", "till_refunds", "discounts", "item_discounts"];
export const isTill = (k: string): k is TillReportKind => (TILL_KINDS as string[]).includes(k);

export type TillFilter = { channel: "all" | "online" | "counter"; cashier: string | null };
let filter: TillFilter = { channel: "all", cashier: null };
const subs = new Set<() => void>();
export function setTillFilter(f: Partial<TillFilter>) {
  filter = { ...filter, ...f };
  subs.forEach((s) => s());
}
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => subs.delete(cb);
};
const SERVER: TillFilter = { channel: "all", cashier: null };
export const useTillFilter = () => useSyncExternalStore(subscribe, () => filter, () => SERVER);
export const runTill = (k: TillReportKind, from: string, to: string) => tillReport(k, from, to, CHANNEL_KINDS.includes(k) ? filter.channel : "all", filter.cashier);
