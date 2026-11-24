"use client";

import { useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import type { AdminCategory } from "@/lib/admin-data";
import { refreshCollection, ruleText, type Collection, type CollectionRules, type CollectionSort, type Rule, type RuleField, type TagOption } from "@/lib/collections";
import { errText } from "@/lib/orders-db";

// An automatic collection's rules editor, shared by the Collections page in
// every design (moved out of products/collections/page.tsx unchanged).
// the rules of an automatic collection, saved together
const FIELDS: {
  field: RuleField;
  label: string;
  ops: [string, string][];
  input: "category" | "tag" | "text" | "number" | "none";
}[] = [
  {
    field: "category",
    label: "Category",
    ops: [
      ["is", "is"],
      ["is_not", "is not"],
    ],
    input: "category",
  },
  {
    field: "tag",
    label: "Sub-category tag",
    ops: [["is", "is"]],
    input: "tag",
  },
  {
    field: "brand",
    label: "Brand",
    ops: [
      ["is", "is"],
      ["contains", "contains"],
    ],
    input: "text",
  },
  {
    field: "name",
    label: "Name",
    ops: [
      ["contains", "contains"],
      ["not_contains", "doesn't contain"],
    ],
    input: "text",
  },
  {
    field: "price",
    label: "Price (₹)",
    ops: [
      ["under", "under"],
      ["over", "over"],
    ],
    input: "number",
  },
  { field: "in_stock", label: "In stock", ops: [["is", "yes"]], input: "none" },
  { field: "on_sale", label: "On sale", ops: [["is", "yes"]], input: "none" },
  {
    field: "new_days",
    label: "Added in the last … days",
    ops: [["within", "within"]],
    input: "number",
  },
  {
    field: "sold_days",
    label: "Sold in the last … days",
    ops: [["within", "within"]],
    input: "number",
  },
];
const SORTS: [CollectionSort, string][] = [
  ["best_selling", "Best selling (90 days)"],
  ["newest", "Newest first"],
  ["price_asc", "Price, low to high"],
  ["price_desc", "Price, high to low"],
  ["name", "Name, A to Z"],
  ["manual", "Shop order"],
];

export function RulesEditor({
  c,
  auto,
  cats,
  tags,
  onRules,
}: {
  c: Collection;
  auto: CollectionRules;
  cats: AdminCategory[];
  tags: TagOption[];
  onRules: (r: CollectionRules) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CollectionRules>(auto);
  const [busy, setBusy] = useState(false);
  const catName = (slug: string) => cats.find((x) => x.slug === slug)?.name ?? slug;
  const tagName = (id: string) => {
    const t = tags.find((x) => x.id === id);
    return t ? `${t.name}${cats.find((x) => x.id === t.category_id) ? ` (${cats.find((x) => x.id === t.category_id)!.name})` : ""}` : "a removed tag";
  };
  const set = (i: number, r: Partial<Rule>) =>
    setDraft({
      ...draft,
      rules: draft.rules.map((x, k) => (k === i ? { ...x, ...r } : x)),
    });
  const add = () =>
    setDraft({
      ...draft,
      rules: [...draft.rules, { field: "category", op: "is", value: cats[0]?.slug ?? "" }],
    });
  const ready =
    draft.rules.length > 0 &&
    draft.rules.every((r) => (FIELDS.find((f) => f.field === r.field)?.input === "none" ? true : String(r.value ?? "").trim() !== ""));
  const dirty = JSON.stringify(draft) !== JSON.stringify(auto);

  async function save() {
    setBusy(true);
    try {
      await onRules(draft);
      toast("Rules saved: the collection has filled itself");
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }
  async function now() {
    setBusy(true);
    try {
      const n = await refreshCollection(c.id);
      await onRules(auto);
      toast(`${n} product${n === 1 ? "" : "s"} match now`);
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }

  return (
    <div className="col-rules">
      <p className="adm-small" style={{ margin: 0 }}>
        Products that match{" "}
        <select
          className="adm-input col-inline"
          value={draft.match}
          onChange={(e) => setDraft({ ...draft, match: e.target.value as "all" | "any" })}
          aria-label="Match"
        >
          <option value="all">all of these</option>
          <option value="any">any of these</option>
        </select>
        . Drafts and archived products never show.
      </p>
      <ul>
        {draft.rules.map((r, i) => {
          const f = FIELDS.find((x) => x.field === r.field)!;
          return (
            <li key={i}>
              <select
                className="adm-input"
                value={r.field}
                aria-label="What to check"
                onChange={(e) => {
                  const nf = FIELDS.find((x) => x.field === e.target.value)!;
                  set(i, {
                    field: nf.field,
                    op: nf.ops[0][0],
                    value: nf.input === "none" ? true : nf.input === "category" ? (cats[0]?.slug ?? "") : nf.input === "tag" ? (tags[0]?.id ?? "") : "",
                  });
                }}
              >
                {FIELDS.map((x) => (
                  <option key={x.field} value={x.field}>
                    {x.label}
                  </option>
                ))}
              </select>
              {f.ops.length > 1 ? (
                <select className="adm-input" value={r.op} aria-label="How" onChange={(e) => set(i, { op: e.target.value })}>
                  {f.ops.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="adm-muted adm-small">{f.ops[0][1]}</span>
              )}
              {f.input === "category" && (
                <select className="adm-input" value={String(r.value)} aria-label="Category" onChange={(e) => set(i, { value: e.target.value })}>
                  {cats.map((x) => (
                    <option key={x.id} value={x.slug}>
                      {x.name}
                    </option>
                  ))}
                </select>
              )}
              {f.input === "tag" &&
                (tags.length ? (
                  <select className="adm-input" value={String(r.value)} aria-label="Tag" onChange={(e) => set(i, { value: e.target.value })}>
                    {tags.map((x) => (
                      <option key={x.id} value={x.id}>
                        {tagName(x.id)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="adm-muted adm-small">No sub-category tags yet</span>
                ))}
              {(f.input === "text" || f.input === "number") && (
                <input
                  className="adm-input"
                  value={String(r.value ?? "")}
                  inputMode={f.input === "number" ? "numeric" : undefined}
                  maxLength={60}
                  aria-label="Value"
                  onChange={(e) =>
                    set(i, {
                      value: f.input === "number" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value,
                    })
                  }
                />
              )}
              <button
                type="button"
                className="adm-btn"
                aria-label={`Remove rule: ${ruleText(r, { category: catName, tag: tagName })}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    rules: draft.rules.filter((_, k) => k !== i),
                  })
                }
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <div className="col-rules-foot">
        <button type="button" className="adm-btn" onClick={add}>
          + Add a rule
        </button>
        <label className="adm-small">
          Order{" "}
          <select className="adm-input col-inline" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value as CollectionSort })}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-small">
          At most{" "}
          <input
            className="adm-input col-inline"
            style={{ width: 70 }}
            inputMode="numeric"
            placeholder="all"
            value={draft.max_items ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ""));
              setDraft({
                ...draft,
                max_items: n > 0 ? Math.min(500, n) : null,
              });
            }}
          />
        </label>
      </div>
      {draft.rules.length > 0 && (
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          {draft.rules.map((r) => ruleText(r, { category: catName, tag: tagName })).join(draft.match === "all" ? " and " : " or ")}.
        </p>
      )}
      <div className="adm-actions">
        <button type="button" className="adm-btn pri" disabled={busy || !ready || !dirty} onClick={save}>
          Save rules
        </button>
        <button type="button" className="adm-btn" disabled={busy || dirty || !auto.rules.length} onClick={now}>
          Refresh now
        </button>
      </div>
    </div>
  );
}
