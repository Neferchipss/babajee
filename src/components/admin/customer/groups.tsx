"use client";

import { useState } from "react";
import { blankRule, FIELDS, kindOf, meetsAll, needsValue, opsFor, type Rule, type RuleField } from "@/lib/customer-groups";
import type { Customer } from "@/lib/orders-db";

// Customer groups: the shop's ready-made ones, and the builder for its own
// (rules like "spent over ₹5,000 in Pune"). Shared by Customers and the
// Aronium-style design's Customers & suppliers screen.
export const SEGMENTS: { id: string; label: string; match: (c: Customer) => boolean }[] = [
  { id: "all", label: "Everyone", match: () => true },
  { id: "customers", label: "Customers", match: (c) => c.role !== "admin" },
  { id: "admins", label: "Admins", match: (c) => c.role === "admin" },
  { id: "test", label: "Test accounts", match: (c) => c.is_test },
  { id: "buyers", label: "Have ordered", match: (c) => c.orders > 0 },
  { id: "repeat", label: "Repeat buyers", match: (c) => c.orders > 1 },
  { id: "never", label: "Never ordered", match: (c) => c.orders === 0 },
  { id: "quiet", label: "No order in 90 days", match: (c) => c.orders > 0 && !!c.last_order && Date.now() - new Date(c.last_order).getTime() > 90 * 864e5 },
];

// A group from rules, all of which must match, with a live count.
export function GroupBuilder({
  start,
  rows,
  tags,
  cities,
  states,
  onCancel,
  onSave,
  onDelete,
}: {
  start: { id?: string; name: string; rules: Rule[] };
  rows: Customer[];
  tags: string[];
  cities: string[];
  states: string[];
  onCancel: () => void;
  onSave: (g: { id?: string; name: string; rules: Rule[] }) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(start.name);
  const [rules, setRules] = useState<Rule[]>(start.rules);
  const [busy, setBusy] = useState(false);
  const n = rows.filter((c) => meetsAll(c, rules)).length;
  const set = (i: number, r: Rule) => setRules(rules.map((x, j) => (j === i ? r : x)));
  const listFor = (f: RuleField) => (f === "tag" ? tags : f === "city" ? cities : f === "state" ? states : []);
  return (
    <form
      method="dialog"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        await onSave({ id: start.id, name: name.trim(), rules: rules.filter((r) => !needsValue(r) || r.value.trim()) });
        setBusy(false);
      }}
    >
      <h2>{start.id ? "Edit group" : "New customer group"}</h2>
      <label className="adm-label">
        Name
        <input className="adm-input" value={name} maxLength={60} placeholder="Big spenders in Pune" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="cus-rule-list">
        <span className="adm-muted adm-small">Customers who match all of these:</span>
        {rules.map((r, i) => {
          const kind = kindOf(r.field);
          const list = listFor(r.field);
          return (
            <div key={i} className="cus-rule">
              <select
                className="adm-input"
                value={r.field}
                aria-label="What to look at"
                onChange={(e) => set(i, blankRule(e.target.value as RuleField))}
              >
                {FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select className="adm-input" value={r.op} aria-label="How" onChange={(e) => set(i, { ...r, op: e.target.value })}>
                {opsFor(r.field).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {needsValue(r) ? (
                <span className="cus-val">
                  {kind === "money" && <i>₹</i>}
                  <input
                    className="adm-input"
                    value={r.value}
                    inputMode={kind === "money" || kind === "count" || kind === "days" ? "numeric" : undefined}
                    list={list.length ? `cus-list-${i}` : undefined}
                    placeholder={kind === "money" ? "5000" : kind === "count" ? "2" : kind === "days" ? "90" : kind === "tag" ? "wholesale" : r.field === "city" ? "Pune, Mumbai" : "Maharashtra"}
                    aria-label="Value"
                    onChange={(e) => set(i, { ...r, value: kind === "money" || kind === "count" || kind === "days" ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })}
                  />
                  {kind === "days" && <i>days{r.op === "over" ? " ago" : ""}</i>}
                  {list.length > 0 && (
                    <datalist id={`cus-list-${i}`}>
                      {list.map((x) => (
                        <option key={x} value={x} />
                      ))}
                    </datalist>
                  )}
                </span>
              ) : (
                <span />
              )}
              <button type="button" className="cus-x" aria-label="Remove this rule" disabled={rules.length === 1} onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          );
        })}
        <button type="button" className="adm-link" onClick={() => setRules([...rules, blankRule("orders")])}>
          + Add a rule
        </button>
      </div>
      <p className="cus-count">
        <b>{n}</b> customer{n === 1 ? "" : "s"} match right now
      </p>
      <div className="adm-actions" style={{ justifyContent: "space-between" }}>
        {onDelete ? (
          <button type="button" className="adm-btn bad" onClick={onDelete}>
            Delete group
          </button>
        ) : (
          <span />
        )}
        <span style={{ display: "flex", gap: 8 }}>
          <button type="button" className="adm-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="adm-btn pri" disabled={busy || !name.trim()}>
            {busy ? "Saving" : start.id ? "Save group" : "Create group"}
          </button>
        </span>
      </div>
    </form>
  );
}

