// Customer groups the shop builds itself ("spent over ₹5,000 in Pune"): a
// list of rules, all of which a customer must meet. Saved in
// customer_segments (0027) and applied here, on the Customers page, to the
// list admin_customers() returns.
import { ageOf } from "./age";
import type { Customer } from "./orders-db";

export type RuleField = "spent" | "orders" | "age" | "last_order" | "joined" | "city" | "state" | "tag" | "account";
export type Rule = { field: RuleField; op: string; value: string };

type Kind = "money" | "count" | "days" | "text" | "tag" | "account";
export const FIELDS: { id: RuleField; label: string; kind: Kind }[] = [
  { id: "spent", label: "Amount spent", kind: "money" },
  { id: "orders", label: "Number of orders", kind: "count" },
  { id: "age", label: "Age", kind: "count" },
  { id: "last_order", label: "Last order", kind: "days" },
  { id: "joined", label: "Joined", kind: "days" },
  { id: "city", label: "City", kind: "text" },
  { id: "state", label: "State", kind: "text" },
  { id: "tag", label: "Tag", kind: "tag" },
  { id: "account", label: "Account", kind: "account" },
];

export const OPS: Record<Kind, { id: string; label: string; noValue?: boolean }[]> = {
  money: [
    { id: "gte", label: "is at least" },
    { id: "lte", label: "is at most" },
  ],
  count: [
    { id: "gte", label: "is at least" },
    { id: "lte", label: "is at most" },
    { id: "eq", label: "is exactly" },
  ],
  days: [
    { id: "within", label: "in the last" },
    { id: "over", label: "more than" },
    { id: "never", label: "never", noValue: true },
  ],
  text: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is not" },
  ],
  tag: [
    { id: "has", label: "includes" },
    { id: "has_not", label: "doesn't include" },
  ],
  account: [
    { id: "customer", label: "is a customer", noValue: true },
    { id: "admin", label: "is an admin", noValue: true },
    { id: "test", label: "is a test account", noValue: true },
    { id: "real", label: "is not a test account", noValue: true },
  ],
};

export const kindOf = (f: RuleField) => FIELDS.find((x) => x.id === f)!.kind;
export const opsFor = (f: RuleField) => OPS[kindOf(f)];
export const needsValue = (r: Rule) => !opsFor(r.field).find((o) => o.id === r.op)?.noValue;
export const blankRule = (field: RuleField = "spent"): Rule => ({ field, op: opsFor(field)[0].id, value: "" });

const DAY = 864e5;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function meets(c: Customer, r: Rule): boolean {
  const n = Number(r.value);
  const v = r.value.trim();
  switch (r.field) {
    case "age": {
      if (!v || isNaN(n)) return true;
      const a = ageOf(c.date_of_birth);
      if (a === null) return false; // no date of birth: not in an age group
      return r.op === "gte" ? a >= n : r.op === "lte" ? a <= n : a === n;
    }
    case "spent":
    case "orders": {
      if (!v || isNaN(n)) return true; // not filled in yet: no effect
      const x = r.field === "spent" ? c.spent : c.orders;
      return r.op === "gte" ? x >= n : r.op === "lte" ? x <= n : x === n;
    }
    case "last_order":
    case "joined": {
      const at = r.field === "joined" ? c.joined : c.last_order;
      if (r.op === "never") return !at;
      if (!v || isNaN(n)) return true;
      if (!at) return false;
      const age = (Date.now() - new Date(at).getTime()) / DAY;
      return r.op === "within" ? age <= n : age > n;
    }
    case "city":
    case "state": {
      if (!v) return true;
      // several places, comma-separated: any of them
      const place = r.field === "city" ? c.city : c.state;
      const any = v.split(",").some((p) => p.trim() && same(place, p));
      return r.op === "is" ? any : !any;
    }
    case "tag": {
      if (!v) return true;
      const has = c.tags.some((t) => same(t, v));
      return r.op === "has" ? has : !has;
    }
    case "account":
      return r.op === "admin" ? c.role === "admin" : r.op === "customer" ? c.role !== "admin" : r.op === "test" ? c.is_test : !c.is_test;
  }
}

export const meetsAll = (c: Customer, rules: Rule[]) => rules.every((r) => meets(c, r));

// "Amount spent is at least ₹5,000"
export function describe(r: Rule) {
  const f = FIELDS.find((x) => x.id === r.field)!;
  const op = opsFor(r.field).find((o) => o.id === r.op);
  if (!op) return f.label;
  if (op.noValue) return r.field === "account" ? `Account ${op.label}` : `${f.label}: ${op.label}`;
  const v = r.value.trim() || "…";
  const val = f.kind === "money" ? `₹${Number(v).toLocaleString("en-IN")}` : f.kind === "days" ? `${v} days${r.op === "over" ? " ago" : ""}` : v;
  return `${f.label} ${op.label} ${val}`;
}
