"use client";

import { useCallback, useEffect, useState } from "react";
import type { adminApi } from "@/lib/admin-api";
import type { AdminProduct, SubGroup, Subcategory } from "@/lib/admin-data";
import { errText } from "@/lib/orders-db";
import { suggestTags, SUBCATEGORY_RULES } from "@/lib/subcategory-rules";
import "./subcategories.css";

type Api = ReturnType<typeof adminApi>;
export type List = { groups: SubGroup[]; tags: Subcategory[] };

export function useSubcategories(api: Api, categoryId: string) {
  const [list, setList] = useState<List | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(
    () =>
      api
        .listSubcategories(categoryId)
        .then((l) => {
          setList(l);
          setErr("");
        })
        .catch((e) => setErr(errText(e))),
    [api, categoryId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  // a change, then the list read again; a refusal (a name taken) said
  // plainly, after the reload (which would otherwise clear it). true: done.
  const run = async (work: () => Promise<unknown>) => {
    let failed = "";
    try {
      await work();
    } catch (e) {
      failed = errText(e);
    }
    await load();
    setErr(failed);
    return !failed;
  };
  return { list, err, run };
}

// A category's sub-categories (0063), under its settings: groups (filter rows
// on the shop, "Size", "Percs") and the tags, each with its group, how many
// products carry it, whether the shop shows it, and its place in the order.
export function SubcategoryManager({
  api,
  categoryId,
  categorySlug,
  categoryName,
  products,
  onTagged,
}: {
  api: Api;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  products: AdminProduct[];
  onTagged: () => void;
}) {
  const { list, err, run } = useSubcategories(api, categoryId);
  const [filling, setFilling] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [groupName, setGroupName] = useState("");
  if (!list) return <div className="sub-mgr">{err ? <p className="ape-err">{err}</p> : <p className="ape-hint">Loading sub-categories…</p>}</div>;
  const { groups, tags } = list;
  const add = () => {
    const n = name.trim();
    if (!n) return;
    // kept in the box until it's saved, so a refusal can be corrected
    void run(() => api.saveSubcategory(categoryId, { name: n, group_id: group || null, sort_order: tags.length })).then((ok) => ok && setName(""));
  };
  const move = (i: number, d: -1 | 1) => {
    const a = tags[i];
    const b = tags[i + d];
    if (!a || !b) return;
    void run(async () => {
      await api.saveSubcategory(categoryId, { id: a.id, sort_order: i + d });
      await api.saveSubcategory(categoryId, { id: b.id, sort_order: i });
    });
  };
  return (
    <div className="sub-mgr" aria-label={`${categoryName} sub-categories`}>
      <div className="sub-head">
        <b>Sub-categories</b>
        <small>Tags within {categoryName}. A product can have several; each gets its own page on the shop.</small>
      </div>

      <div className="sub-groups">
        <span className="sub-label">Groups</span>
        {groups.map((g) => (
          <GroupChip key={g.id} group={g} onRename={(n) => run(() => api.saveSubGroup(categoryId, { id: g.id, name: n }))} onDelete={() => run(() => api.deleteSubGroup(g.id))} />
        ))}
        <input
          className="sub-input sub-input--sm"
          value={groupName}
          placeholder="+ Group, e.g. Size"
          aria-label="New group name"
          maxLength={40}
          onChange={(e) => setGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !groupName.trim()) return;
            const n = groupName.trim();
            void run(() => api.saveSubGroup(categoryId, { name: n, sort_order: groups.length })).then((ok) => ok && setGroupName(""));
          }}
        />
      </div>

      {tags.length > 0 && (
        <ul className="sub-list">
          {tags.map((t, i) => (
            <TagRow
              key={t.id}
              tag={t}
              groups={groups}
              first={i === 0}
              last={i === tags.length - 1}
              onSave={(patch) => run(() => api.saveSubcategory(categoryId, { id: t.id, ...patch }))}
              onDelete={() => run(() => api.deleteSubcategory(t.id))}
              onMove={(d) => move(i, d)}
            />
          ))}
        </ul>
      )}

      <div className="sub-add">
        <input className="sub-input" value={name} placeholder="New sub-category, e.g. 27 inch" aria-label="New sub-category name" maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        {groups.length > 0 && (
          <select className="sub-input sub-input--sm" value={group} aria-label="Its group" onChange={(e) => setGroup(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="ap-chip" disabled={!name.trim()} onClick={add}>
          Add
        </button>
      </div>
      {SUBCATEGORY_RULES[categorySlug] &&
        (filling ? (
          <StarterFill
            api={api}
            categoryId={categoryId}
            categorySlug={categorySlug}
            list={list}
            products={products}
            onDone={() => {
              setFilling(false);
              void run(async () => {});
              onTagged();
            }}
            onCancel={() => setFilling(false)}
          />
        ) : (
          <button type="button" className="ap-chip sub-fill-open" onClick={() => setFilling(true)}>
            Fill from product names…
          </button>
        ))}
      {err && <p className="ape-err">{err}</p>}
    </div>
  );
}

// The category's starting sub-categories, and each product's tags read from
// its name, shown before anything is saved: untick what's wrong, then save.
// Makes the groups and tags that aren't there yet and adds the ticked tags to
// each product (tags it already has stay).
// what Fill from product names will do, and the save, shared by both
// designs' fill windows (StarterFill here, Aronium's in its Product groups)
export function useStarterFill({
  api,
  categoryId,
  categorySlug,
  list,
  products,
  onDone,
}: {
  api: Api;
  categoryId: string;
  categorySlug: string;
  list: List;
  products: AdminProduct[];
  onDone: () => void;
}) {
  const key = (g: string, t: string) => `${g}|${t}`;
  const named = new Map(list.tags.map((t) => [t.name.toLowerCase(), t]));
  const rows = products
    .map((p) => ({ p, tags: suggestTags(categorySlug, p.name).filter(({ tag }) => !p.subcategory_ids.includes(named.get(tag.toLowerCase())?.id ?? "")) }))
    .filter((r) => r.tags.length);
  // ticked: product id -> its picked [group|tag]s
  const [picked, setPicked] = useState<Map<string, Set<string>>>(() => new Map(rows.map((r) => [r.p.id, new Set(r.tags.map((t) => key(t.group, t.tag)))])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const used = new Set([...picked.values()].flatMap((s) => [...s]));
  const toMake = SUBCATEGORY_RULES[categorySlug].flatMap((g) => g.tags.filter((t) => used.has(key(g.group, t.tag)) && !named.has(t.tag.toLowerCase())).map((t) => t.tag));
  const tagged = [...picked.values()].filter((s) => s.size).length;
  const flip = (pid: string, k: string) =>
    setPicked((m) => {
      const n = new Map(m);
      const s = new Set(n.get(pid));
      if (s.has(k)) s.delete(k);
      else s.add(k);
      n.set(pid, s);
      return n;
    });

  async function save() {
    setBusy(true);
    setErr("");
    try {
      // groups and tags first, in the rules' order
      const groupId = new Map(list.groups.map((g) => [g.name.toLowerCase(), g.id]));
      const tagId = new Map(list.tags.map((t) => [t.name.toLowerCase(), t.id]));
      let order = list.tags.length;
      for (const [gi, g] of SUBCATEGORY_RULES[categorySlug].entries()) {
        const wanted = g.tags.filter((t) => used.has(key(g.group, t.tag)));
        if (!wanted.length) continue;
        if (!groupId.has(g.group.toLowerCase())) groupId.set(g.group.toLowerCase(), await api.saveSubGroup(categoryId, { name: g.group, sort_order: list.groups.length + gi }));
        for (const t of wanted)
          if (!tagId.has(t.tag.toLowerCase())) tagId.set(t.tag.toLowerCase(), await api.saveSubcategory(categoryId, { name: t.tag, group_id: groupId.get(g.group.toLowerCase())!, sort_order: order++ }));
      }
      // then each product: what it had, and what was ticked
      for (const { p } of rows) {
        const add = [...(picked.get(p.id) ?? [])].map((k) => tagId.get(k.split("|")[1].toLowerCase())!).filter(Boolean);
        if (add.length) await api.setProductSubcategories(p.id, [...new Set([...p.subcategory_ids, ...add])]);
      }
      onDone();
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  return { key, rows, picked, flip, toMake, tagged, save, busy, err };
}

export function StarterFill({
  api,
  categoryId,
  categorySlug,
  list,
  products,
  onDone,
  onCancel,
}: {
  api: Api;
  categoryId: string;
  categorySlug: string;
  list: List;
  products: AdminProduct[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { key, rows, picked, flip, toMake, tagged, save, busy, err } = useStarterFill({ api, categoryId, categorySlug, list, products, onDone });
  return (
    <div className="sub-fill">
      <p className="ape-hint">
        {rows.length
          ? `From their names: ${tagged} of ${products.length} products get tags${toMake.length ? `, and ${toMake.length} new sub-categories are made (${toMake.join(", ")})` : ""}. Untick anything wrong, then save.`
          : "Nothing new to add from the product names."}
      </p>
      {rows.length > 0 && (
        <ul className="sub-fill-list">
          {rows.map(({ p, tags }) => (
            <li key={p.id}>
              <span className="sub-fill-name">{p.name}</span>
              <span className="sub-pick-row">
                {tags.map((t) => {
                  const k = key(t.group, t.tag);
                  const on = picked.get(p.id)?.has(k) ?? false;
                  return (
                    <button key={k} type="button" className={`ap-chip ${on ? "is-on" : ""}`} aria-pressed={on} title={t.group} onClick={() => flip(p.id, k)}>
                      {t.tag}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="ape-err">{err}</p>}
      <div className="sub-add">
        <button type="button" className="ap-chip" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {rows.length > 0 && (
          <button type="button" className="ap-chip is-on" onClick={save} disabled={busy || !tagged}>
            {busy ? "Saving…" : `Save: tag ${tagged} products`}
          </button>
        )}
      </div>
    </div>
  );
}

function GroupChip({ group: g, onRename, onDelete }: { group: SubGroup; onRename: (n: string) => void; onDelete: () => void }) {
  const [n, setN] = useState(g.name);
  return (
    <span className="sub-group">
      <input className="sub-input sub-input--sm" value={n} aria-label={`Group ${g.name}`} maxLength={40} onChange={(e) => setN(e.target.value)} onBlur={() => n.trim() && n.trim() !== g.name && onRename(n.trim())} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      <button type="button" className="sub-x" aria-label={`Remove the group ${g.name} (its tags stay)`} title="Remove the group (its tags stay)" onClick={onDelete}>
        ×
      </button>
    </span>
  );
}

function TagRow({
  tag: t,
  groups,
  first,
  last,
  onSave,
  onDelete,
  onMove,
}: {
  tag: Subcategory;
  groups: SubGroup[];
  first: boolean;
  last: boolean;
  onSave: (patch: Partial<Subcategory>) => void;
  onDelete: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const [n, setN] = useState(t.name);
  const [sure, setSure] = useState(false);
  return (
    <li className="sub-row">
      <input className="sub-input" value={n} aria-label={`Sub-category ${t.name}`} maxLength={40} onChange={(e) => setN(e.target.value)} onBlur={() => n.trim() && n.trim() !== t.name && onSave({ name: n.trim() })} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      {groups.length > 0 && (
        <select className="sub-input sub-input--sm" value={t.group_id ?? ""} aria-label={`${t.name} group`} onChange={(e) => onSave({ group_id: e.target.value || null })}>
          <option value="">No group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      <small className="sub-count" title={`/shop/…/${t.slug}/`}>
        {t.products} product{t.products === 1 ? "" : "s"}
      </small>
      <button type="button" className={`ap-chip ${t.is_visible ? "" : "is-on"}`} onClick={() => onSave({ is_visible: !t.is_visible })}>
        {t.is_visible ? "Shown" : "Hidden"}
      </button>
      <button type="button" className="sub-x" disabled={first} aria-label={`Move ${t.name} up`} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className="sub-x" disabled={last} aria-label={`Move ${t.name} down`} onClick={() => onMove(1)}>
        ↓
      </button>
      {sure ? (
        <button type="button" className="sub-x is-sure" onClick={onDelete} onBlur={() => setSure(false)}>
          Delete?
        </button>
      ) : (
        <button type="button" className="sub-x" aria-label={`Delete ${t.name}`} title={t.products ? `Delete: it comes off its ${t.products} products` : "Delete"} onClick={() => setSure(true)}>
          ×
        </button>
      )}
    </li>
  );
}

// A product's sub-categories (0063): its category's tags, by group, one tap
// each to add or take off; or a new one, made and added at once.
export function TagPicker({ api, product, categorySlug, onChanged }: { api: Api; product: AdminProduct; categorySlug: string; onChanged: () => void }) {
  const { list, err, run } = useSubcategories(api, product.category_id);
  const [picked, setPicked] = useState<string[]>(product.subcategory_ids);
  const [fresh, setFresh] = useState("");
  const save = (ids: string[]) => {
    setPicked(ids);
    void run(async () => {
      await api.setProductSubcategories(product.id, ids);
      onChanged();
    });
  };
  const create = () => {
    const n = fresh.trim();
    if (!n || !list) return;
    void run(async () => {
      const id = await api.saveSubcategory(product.category_id, { name: n, sort_order: list.tags.length });
      const ids = [...picked, id];
      setPicked(ids);
      await api.setProductSubcategories(product.id, ids);
      onChanged();
    }).then((ok) => ok && setFresh(""));
  };
  // what the name points to and the product doesn't have yet (0063 rules)
  const hints = list ? suggestTags(categorySlug, product.name).filter(({ tag }) => !list.tags.some((t) => t.name.toLowerCase() === tag.toLowerCase() && picked.includes(t.id))) : [];
  const addHint = (h: { group: string; tag: string }) =>
    list &&
    void run(async () => {
      let t = list.tags.find((x) => x.name.toLowerCase() === h.tag.toLowerCase())?.id;
      if (!t) {
        const g = list.groups.find((x) => x.name.toLowerCase() === h.group.toLowerCase())?.id ?? (await api.saveSubGroup(product.category_id, { name: h.group, sort_order: list.groups.length }));
        t = await api.saveSubcategory(product.category_id, { name: h.tag, group_id: g, sort_order: list.tags.length });
      }
      const ids = [...picked, t];
      setPicked(ids);
      await api.setProductSubcategories(product.id, ids);
      onChanged();
    });
  const rows = list ? [{ id: "", name: "" }, ...list.groups].map((g) => ({ g, tags: list.tags.filter((t) => (t.group_id ?? "") === g.id) })).filter((r) => r.tags.length) : [];
  return (
    <div className="ape-field ape-field--wide sub-pick">
      <span>Sub-categories</span>
      {!list ? (
        <small className="ape-hint">{err || "Loading…"}</small>
      ) : (
        <>
          {rows.map(({ g, tags }) => (
            <div key={g.id || "-"} className="sub-pick-row" role="group" aria-label={g.name || "Sub-categories"}>
              {g.name && <span className="sub-label">{g.name}</span>}
              {tags.map((t) => {
                const on = picked.includes(t.id);
                return (
                  <button key={t.id} type="button" className={`ap-chip ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => save(on ? picked.filter((x) => x !== t.id) : [...picked, t.id])}>
                    {t.name}
                    {!t.is_visible && <small> (hidden)</small>}
                  </button>
                );
              })}
            </div>
          ))}
          {hints.length > 0 && (
            <div className="sub-pick-row" role="group" aria-label="Suggested from the name">
              <span className="sub-label">From the name</span>
              {hints.map((h) => (
                <button key={h.tag} type="button" className="ap-chip sub-hint" title={`${h.group}: tap to add`} onClick={() => addHint(h)}>
                  + {h.tag}
                </button>
              ))}
            </div>
          )}
          <input className="sub-input" value={fresh} placeholder={list.tags.length ? "+ New sub-category" : "First sub-category, e.g. King size"} aria-label="New sub-category" maxLength={40} onChange={(e) => setFresh(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} onBlur={create} />
          {err && <p className="ape-err">{err}</p>}
        </>
      )}
    </div>
  );
}
