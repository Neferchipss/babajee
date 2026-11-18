"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { listCategories, listProducts, type AdminCategory, type AdminProduct } from "@/lib/admin-data";
import {
  createCollection,
  deleteCollection,
  listAllTags,
  listCollectionRules,
  listCollections,
  MANUAL,
  refreshCollection,
  ruleText,
  saveCollectionRules,
  setCollectionProducts,
  updateCollection,
  type Collection,
  type CollectionRules,
  type CollectionSort,
  type Rule,
  type RuleField,
  type TagOption,
} from "@/lib/collections";
import { errText } from "@/lib/orders-db";
import "@/components/admin/admin-products.css";

// Collections: hand-picked lists of products ("Staff picks", "Gift ideas"),
// in the order chosen here. A switched-on collection is listed under the
// categories on the shop and opens its own shelf. A product can be in any
// number of collections; archived and draft ones never show on the shop.
export default function CollectionsPage() {
  const [list, setList] = useState<Collection[] | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<Map<string, CollectionRules>>(new Map());
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);

  useEffect(() => {
    listCollectionRules().then(setRules);
    listCategories().then(setCats, () => {});
    listAllTags().then(setTags);
    listCollections().then(
      (l) => {
        setList(l);
        if (l.length) setOpenId(l[0].id);
      },
      (e) => setErr(errText(e)),
    );
    listProducts().then(setProducts, (e) => setErr(errText(e)));
  }, []);

  const open = list?.find((c) => c.id === openId) ?? null;
  const replace = (c: Collection) => setList((l) => (l ?? []).map((x) => (x.id === c.id ? c : x)));

  async function save(c: Collection, patch: Partial<Collection>, done?: string) {
    const next = { ...c, ...patch };
    replace(next);
    try {
      const { product_ids, ...rest } = patch;
      if (Object.keys(rest).length) await updateCollection(c.id, rest);
      if (product_ids) await setCollectionProducts(c.id, product_ids);
      if (done) toast(done);
    } catch (e) {
      replace(c);
      toastError(errText(e));
    }
  }

  async function add(e: React.FormEvent | null, name = newName) {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createCollection(name, list?.length ?? 0);
      const fresh = await listCollections();
      setList(fresh);
      setOpenId(id);
      setNewName("");
      toast("Collection added. It's off the shop until you switch it on.");
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  return (
    <div>
      <Link href="/admin/products" className="adm-back adm-only-narrow">
        ← Products
      </Link>
      <header className="adm-pagehead">
        <h1>Collections</h1>
        <p>
          Hand-picked lists of products, like Staff picks or Gift ideas. Switched-on collections show under the categories on the shop, with the products in the
          order you set.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <div className={`col-wrap ${list?.length === 0 ? "is-empty" : ""}`}>
        <aside className="adm-card col-list">
          {list === null ? (
            <p className="adm-muted adm-small">Loading.</p>
          ) : (
            <ul>
              {list.map((c, i) => (
                <li key={c.id}>
                  <button type="button" className={c.id === openId ? "is-on" : ""} onClick={() => setOpenId(c.id)}>
                    <span>{c.name}</span>
                    <small className="adm-muted">
                      {c.product_ids.length} · {c.is_visible ? "on the shop" : "off"}
                    </small>
                  </button>
                  <span className="col-move">
                    <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => reorder(i, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${c.name} down`} disabled={i === list.length - 1} onClick={() => reorder(i, 1)}>
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {list?.length === 0 && (
            <div className="col-start">
              <p className="adm-muted adm-small">Start with one of these, or name your own below:</p>
              <div className="adm-chips">
                {["Staff picks", "New in", "Gift ideas", "Under ₹499", "Best sellers"].map((n) => (
                  <button key={n} type="button" className="adm-chip" disabled={busy} onClick={() => add(null, n)}>
                    + {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={add} className="col-new">
            <input
              className="adm-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection, e.g. Staff picks"
              maxLength={60}
            />
            <button className="adm-btn pri" disabled={busy || !newName.trim()}>
              Add
            </button>
          </form>
        </aside>

        {open ? (
          <Editor
            key={open.id}
            c={open}
            products={products}
            onSave={save}
            onDelete={remove}
            auto={rules.get(open.id) ?? MANUAL}
            cats={cats}
            tags={tags}
            onRules={async (r) => {
              await saveCollectionRules(open.id, r);
              setRules((m) => new Map(m).set(open.id, r));
              const fresh = await listCollections();
              setList(fresh);
            }}
          />
        ) : list?.length === 0 ? null : (
          <div />
        )}
      </div>
    </div>
  );

  async function reorder(i: number, d: number) {
    if (!list) return;
    const next = list.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    const ordered = next.map((c, k) => ({ ...c, sort_order: k }));
    setList(ordered);
    try {
      await Promise.all(ordered.map((c) => updateCollection(c.id, { sort_order: c.sort_order })));
    } catch (e) {
      toastError(errText(e));
    }
  }

  async function remove(c: Collection) {
    try {
      await deleteCollection(c.id);
      const rest = (list ?? []).filter((x) => x.id !== c.id);
      setList(rest);
      setOpenId(rest[0]?.id ?? "");
      toast(`${c.name} deleted. Its products are untouched.`);
    } catch (e) {
      toastError(errText(e));
    }
  }
}

type EditorProps = {
  c: Collection;
  products: AdminProduct[];
  onSave: (c: Collection, p: Partial<Collection>, done?: string) => void;
  onDelete: (c: Collection) => void;
  auto: CollectionRules;
  cats: AdminCategory[];
  tags: TagOption[];
  onRules: (r: CollectionRules) => Promise<void>;
};
function Editor({ c, products, onSave, onDelete, auto, cats, tags, onRules }: EditorProps) {
  const [name, setName] = useState(c.name);
  const [tagline, setTagline] = useState(c.tagline);
  const [find, setFind] = useState("");
  const [confirm, setConfirm] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const inIt = c.product_ids.map((id) => byId.get(id)).filter((p): p is AdminProduct => !!p);
  const q = find.trim().toLowerCase();
  const matches = q
    ? products
        .filter((p) => p.status !== "archived" && !c.product_ids.includes(p.id) && `${p.name} ${p.brand} ${p.category_name ?? ""}`.toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  const move = (i: number, d: number) => {
    const ids = c.product_ids.slice();
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    onSave(c, { product_ids: ids });
  };

  return (
    <section className="adm-card col-edit">
      <div className="col-head">
        <input
          className="adm-input col-name"
          value={name}
          maxLength={60}
          aria-label="Collection name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== c.name && onSave(c, { name: name.trim() }, "Renamed")}
        />
        <button
          type="button"
          className={`adm-btn ${c.is_visible ? "pri" : ""}`}
          onClick={() => onSave(c, { is_visible: !c.is_visible }, c.is_visible ? `${c.name} taken off the shop` : `${c.name} is on the shop`)}
        >
          {c.is_visible ? "On the shop" : "Off the shop"}
        </button>
      </div>
      <label className="adm-label">
        Line under the name (optional)
        <input
          className="adm-input"
          value={tagline}
          maxLength={120}
          placeholder="What Baba himself reaches for."
          onChange={(e) => setTagline(e.target.value)}
          onBlur={() => tagline.trim() !== c.tagline && onSave(c, { tagline: tagline.trim() }, "Saved")}
        />
      </label>
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        On the shop at /shop/collections?c={c.slug}
        {c.is_visible && !inIt.length ? " · add products, or it shows an empty shelf" : ""}
      </p>

      <div className="adm-chips" role="radiogroup" aria-label="How products are chosen">
        <button
          type="button"
          role="radio"
          aria-checked={auto.mode === "manual"}
          className={`adm-chip ${auto.mode === "manual" ? "is-on" : ""}`}
          onClick={() =>
            auto.mode !== "manual" && onRules({ ...auto, mode: "manual" }).then(() => toast("Hand-picked: the products stay as they are now"), toastError)
          }
        >
          Hand-picked
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={auto.mode === "auto"}
          className={`adm-chip ${auto.mode === "auto" ? "is-on" : ""}`}
          onClick={() => auto.mode !== "auto" && onRules({ ...auto, mode: "auto" }).then(() => toast("Automatic: add rules below"), toastError)}
        >
          Automatic, from rules
        </button>
      </div>

      {auto.mode === "auto" && <RulesEditor c={c} auto={auto} cats={cats} tags={tags} onRules={onRules} />}

      <h2 style={{ marginTop: 8 }}>
        {inIt.length} product{inIt.length === 1 ? "" : "s"}
        {auto.mode === "auto" && <small className="adm-muted adm-small"> · chosen by the rules, kept up to date by themselves</small>}
      </h2>
      {auto.mode === "manual" && (
        <div className="col-find">
          <input
            className="adm-input"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Add a product: type its name"
            aria-label="Find a product to add"
          />
          {matches.length > 0 && (
            <ul>
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSave(c, { product_ids: [...c.product_ids, p.id] });
                      setFind("");
                    }}
                  >
                    {p.name}
                    <small className="adm-muted"> · {p.category_name}</small>
                    {p.status === "draft" && <small className="adm-muted"> · draft</small>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ol className="col-items">
        {inIt.map((p, i) => (
          <li key={p.id}>
            <span className="col-pos">{i + 1}</span>
            <span className="col-pname">
              {p.name}
              <small className="adm-muted">
                {" "}
                · {p.category_name}
                {p.status !== "published" && ` · ${p.status === "draft" ? "draft, not shown" : "archived, not shown"}`}
              </small>
            </span>
            {auto.mode === "manual" && (
              <span className="col-move">
                <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" aria-label={`Move ${p.name} down`} disabled={i === inIt.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Take ${p.name} out`}
                  onClick={() =>
                    onSave(c, {
                      product_ids: c.product_ids.filter((x) => x !== p.id),
                    })
                  }
                >
                  ×
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="adm-actions" style={{ marginTop: 12 }}>
        {confirm ? (
          <>
            <button type="button" className="adm-btn bad" onClick={() => onDelete(c)}>
              Delete {c.name}
            </button>
            <button type="button" className="adm-btn" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="adm-btn" onClick={() => setConfirm(true)}>
            Delete collection
          </button>
        )}
      </div>
    </section>
  );
}

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

function RulesEditor({
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
