"use client";

import { useCallback, useEffect, useState } from "react";
import type { adminApi } from "@/lib/admin-api";
import type { AdminProduct, SubGroup, Subcategory } from "@/lib/admin-data";
import { errText } from "@/lib/orders-db";
import "./subcategories.css";

type Api = ReturnType<typeof adminApi>;
type List = { groups: SubGroup[]; tags: Subcategory[] };

function useSubcategories(api: Api, categoryId: string) {
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
export function SubcategoryManager({ api, categoryId, categoryName }: { api: Api; categoryId: string; categoryName: string }) {
  const { list, err, run } = useSubcategories(api, categoryId);
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
      {err && <p className="ape-err">{err}</p>}
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
export function TagPicker({ api, product, onChanged }: { api: Api; product: AdminProduct; onChanged: () => void }) {
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
          <input className="sub-input" value={fresh} placeholder={list.tags.length ? "+ New sub-category" : "First sub-category, e.g. King size"} aria-label="New sub-category" maxLength={40} onChange={(e) => setFresh(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} onBlur={create} />
          {err && <p className="ape-err">{err}</p>}
        </>
      )}
    </div>
  );
}
