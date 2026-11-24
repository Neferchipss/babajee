"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStarterFill, useSubcategories, type List } from "@/components/admin/Subcategories";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog } from "@/components/admin/ui";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, BoxPreset, SubGroup, Subcategory } from "@/lib/admin-data";
import { GST_BRACKETS } from "@/lib/gst";
import { errText, getSettings } from "@/lib/orders-db";
import { slugify } from "@/lib/slug";
import { SUBCATEGORY_RULES } from "@/lib/subcategory-rules";
import { ArEmpty, ArGrid, ArIcon, ArScreen, ArSwitch, ArToolbar, menuOf, stdMenu, Tick, useArKeys, useArMenu, type ArCol, type ArMenuItem } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";
import { NotKept } from "./aronium-b-kit";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Products • Product groups: Aronium's product group tree on the
// left (the shop's types: Bongs, Rolling Papers…) with its New group / Edit
// group / Delete group, and its New group panel (Details | Image & color).
// Babajee's extensions, in Aronium's style: Move up / Move down for the
// order on the shop, the group panel's Shop page and Tax tabs, and on the
// right the selected group's sub-categories, their filter groups and box
// size presets as grids with their own right-click menus. Under GST a
// product's slab follows its HSN code, so the Tax tab sets the two together.
type Api = ReturnType<typeof adminApi>;
type Pane = "subs" | "filters" | "boxes";
type GroupForm = { id?: string; name: string; tagline: string; is_visible: boolean; sold_in_boxes: boolean };
type SubForm = { id?: string; slug?: string; name: string; group_id: string; is_visible: boolean; seo_title: string; seo_description: string };
type Ask = { title: string; body: string; label: string; danger?: boolean; run: () => Promise<unknown> };

export default function AroniumProductGroups() {
  const api = adminApi();
  const router = useRouter();
  const params = useSearchParams();
  const tree = useArMenu();
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState<GroupForm | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [help, setHelp] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api.listCategories(), api.listProducts()]).then(
        ([c, p]) => {
          setCats(c);
          setProducts(p);
          setErr("");
        },
        (e) => setErr(errText(e)),
      ),
    [api],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useArKeys({ refresh: () => void load() });

  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [products]);
  const openId = params.get("id") ?? cats?.[0]?.id ?? "";
  const open = cats?.find((c) => c.id === openId) ?? null;
  const at = cats && open ? cats.indexOf(open) : -1;
  const pick = (id: string) => router.replace(`/admin/products/categories?id=${id}`, { scroll: false });
  const mine = open ? products.filter((p) => p.category_id === open.id) : [];
  const editGroup = (c: AdminCategory | null) => c && setPanel({ id: c.id, name: c.name, tagline: c.tagline ?? "", is_visible: c.is_visible, sold_in_boxes: !!c.sold_in_boxes });
  const newGroup = () => setPanel({ name: "", tagline: "", is_visible: true, sold_in_boxes: false });

  async function move(c: AdminCategory, d: -1 | 1) {
    if (!cats) return;
    try {
      await api.moveCategory(cats, c.id, d);
      await load();
    } catch (x) {
      toastError(errText(x));
    }
  }
  const delGroup = (c: AdminCategory | null) => {
    if (!c) return;
    if (count.get(c.id)) {
      toastError(`${c.name} has ${count.get(c.id)} products. Move them to another group first (on each product), then it can be deleted.`);
      return;
    }
    setAsk({
      title: `Delete ${c.name}?`,
      body: "Its sub-categories go with it. This can't be undone.",
      label: "Delete",
      danger: true,
      run: async () => {
        await api.deleteCategory(c.id);
        toast(`${c.name} deleted`);
        router.replace("/admin/products/categories", { scroll: false });
        await load();
      },
    });
  };
  const groupMenu = (c: AdminCategory | null): ArMenuItem[] =>
    menuOf(
      [
        { label: "New group", onClick: newGroup },
        { label: "Edit group", disabled: !c, onClick: () => editGroup(c) },
      ],
      [
        { label: "Move up", disabled: !c || cats?.indexOf(c) === 0, onClick: () => c && void move(c, -1) },
        { label: "Move down", disabled: !c || cats?.indexOf(c) === (cats?.length ?? 0) - 1, onClick: () => c && void move(c, 1) },
      ],
      [{ label: "Delete group", disabled: !c || !!count.get(c.id), onClick: () => delGroup(c) }],
      [{ label: "Refresh", key: "F5", onClick: () => void load() }],
    );

  return (
    <ArScreen className="arc arc-groups">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "folderAdd", label: "New group", onClick: newGroup },
          { icon: "folderEdit", label: "Edit group", disabled: !open, onClick: () => editGroup(open) },
          { icon: "del", label: "Delete group", disabled: !open || mine.length > 0, onClick: () => delGroup(open), title: mine.length ? "Move its products to another group first" : undefined },
          { icon: "sort", label: "Move up", disabled: !open || at <= 0, onClick: () => open && void move(open, -1) },
          { icon: "sort", label: "Move down", disabled: !open || !cats || at >= cats.length - 1, onClick: () => open && void move(open, 1) },
          { icon: "list", label: "Products", href: "/admin/products" },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      {cats === null && !err ? (
        <p className="arc-note arc-pane">Loading.</p>
      ) : cats ? (
        <div className="ars-body">
          <nav className="arp-tree" aria-label="Product groups" onContextMenu={(e) => tree.open(e, groupMenu(null))}>
            {tree.node}
            <span className="arp-root arc-grey" style={{ padding: "4px 8px", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <ArIcon name="folder" size={16} />
              Products
            </span>
            <ul>
              {cats.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={c.id === openId ? "is-on" : ""}
                    aria-current={c.id === openId ? "true" : undefined}
                    onClick={() => pick(c.id)}
                    onDoubleClick={() => editGroup(c)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      pick(c.id);
                      tree.open(e, groupMenu(c));
                    }}
                    title={`${count.get(c.id) ?? 0} products${c.is_visible ? "" : " · hidden"}${c.sold_in_boxes ? " · boxes" : ""}`}
                  >
                    <ArIcon name="folder" size={16} />
                    <span className={c.is_visible ? "" : "arc-grey"}>{c.name}</span>
                    <small>{count.get(c.id) ?? 0}</small>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <section className="arp-list">
            {open ? (
              <GroupContents key={open.id} api={api} cat={open} products={mine} onTagged={load} onAsk={setAsk} onEdit={() => editGroup(open)} />
            ) : (
              <ArEmpty title="No product groups yet" action="Add new product group" onAction={newGroup} />
            )}
          </section>
        </div>
      ) : null}

      {panel && cats && (
        <GroupPanel
          key={panel.id ?? "new"}
          api={api}
          start={panel}
          cats={cats}
          products={panel.id ? products.filter((p) => p.category_id === panel.id) : []}
          onAsk={setAsk}
          onChanged={load}
          onClose={() => setPanel(null)}
          onSaved={async (id) => {
            setPanel(null);
            await load();
            if (id) pick(id);
          }}
        />
      )}
      <AskDialog ask={ask} onClose={() => setAsk(null)} />

      <ArHelp open={help} onClose={() => setHelp(false)} title="Product groups">
        <p>Each type of product (Bongs, Rolling Papers…) is a product group, and its sub-categories sit inside it. Products pick their group and sub-categories from these lists; new ones are only made here.</p>
        <p>Right-click a group, or use the toolbar, for New group, Edit group, Move up / Move down (the order on the shop) and Delete group. A group with products can&apos;t be deleted: move them first.</p>
        <p>On the right, the selected group&apos;s sub-categories (each has its own page on the shop), the filter groups they sit in (Material, Size…), and box size presets for groups sold in boxes.</p>
        <p>Edit group &gt; Tax sets the HSN code, and with it the GST slab, on every product in the group. Orders already placed keep what they were charged.</p>
      </ArHelp>
    </ArScreen>
  );
}

// ---------------------------------------------------------------- the right side
function GroupContents({ api, cat, products, onTagged, onAsk, onEdit }: { api: Api; cat: AdminCategory; products: AdminProduct[]; onTagged: () => Promise<unknown>; onAsk: (a: Ask) => void; onEdit: () => void }) {
  const { list, err, run } = useSubcategories(api, cat.id);
  const [pane, setPane] = useState<Pane>("subs");
  const [sel, setSel] = useState<string | null>(null);
  const [gsel, setGsel] = useState<string | null>(null);
  const [sub, setSub] = useState<SubForm | null>(null);
  const [rename, setRename] = useState<{ id?: string; name: string } | null>(null);
  const [filling, setFilling] = useState(false);

  const groups = list?.groups ?? [];
  const tags = list?.tags ?? [];
  // in the shop's order: by filter group (in its order), the ungrouped last, then each tag's own order
  const order = (t: Subcategory) => {
    const i = groups.findIndex((g) => g.id === t.group_id);
    return i < 0 ? groups.length : i;
  };
  const rows = [...tags].sort((a, b) => order(a) - order(b) || a.sort_order - b.sort_order);
  const one = rows.find((t) => t.id === sel) ?? null;
  const peers = (t: Subcategory) => rows.filter((x) => x.group_id === t.group_id);
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "";
  const g1 = groups.find((g) => g.id === gsel) ?? null;

  const newSub = () => setSub({ name: "", group_id: "", is_visible: true, seo_title: "", seo_description: "" });
  const editSub = (t: Subcategory | null) => t && setSub({ id: t.id, slug: t.slug, name: t.name, group_id: t.group_id ?? "", is_visible: t.is_visible, seo_title: t.seo_title ?? "", seo_description: t.seo_description ?? "" });
  const moveSub = (t: Subcategory | null, d: -1 | 1) => {
    if (!t) return;
    const inGroup = peers(t);
    const i = inGroup.indexOf(t);
    const b = inGroup[i + d];
    if (!b) return;
    void run(async () => {
      await api.saveSubcategory(cat.id, { id: t.id, sort_order: b.sort_order });
      await api.saveSubcategory(cat.id, { id: b.id, sort_order: t.sort_order });
    });
  };
  const delSub = (t: Subcategory | null) =>
    t &&
    onAsk({
      title: `Delete ${t.name}?`,
      body: t.products ? `It comes off its ${t.products} product${t.products === 1 ? "" : "s"}, and its page on the shop goes.` : "Its page on the shop goes.",
      label: "Delete",
      danger: true,
      run: () => run(() => api.deleteSubcategory(t.id)),
    });
  const delFilter = (g: SubGroup | null) =>
    g &&
    onAsk({
      title: `Remove the filter group ${g.name}?`,
      body: "Its sub-categories stay, without a group.",
      label: "Remove group",
      danger: true,
      run: () => run(() => api.deleteSubGroup(g.id)),
    });
  const canFill = !!SUBCATEGORY_RULES[cat.slug];

  const subMenu = (t: Subcategory | null): ArMenuItem[] =>
    stdMenu({
      add: newSub,
      addLabel: "New sub-category",
      edit: () => editSub(t),
      editWith: [
        { label: "Move up", disabled: !t || peers(t)[0] === t, onClick: () => moveSub(t, -1) },
        { label: "Move down", disabled: !t || peers(t).slice(-1)[0] === t, onClick: () => moveSub(t, 1) },
      ],
      extra: canFill ? [{ label: "Fill from product names…", onClick: () => setFilling(true) }] : [],
      del: () => delSub(t),
      refresh: () => void run(async () => {}),
      has: !!t,
    });
  const filterMenu = (g: SubGroup | null): ArMenuItem[] =>
    menuOf(
      [{ label: "New filter group", onClick: () => setRename({ name: "" }) }],
      [{ label: "Rename", disabled: !g, onClick: () => g && setRename({ id: g.id, name: g.name }) }],
      [{ label: "Remove group", key: "Del", disabled: !g, onClick: () => delFilter(g) }],
      [{ label: "Refresh", key: "F5", onClick: () => void run(async () => {}) }],
    );
  useArKeys(
    pane === "subs"
      ? { add: newSub, edit: () => editSub(one), del: () => delSub(one) }
      : pane === "filters"
        ? { add: () => setRename({ name: "" }), edit: () => g1 && setRename({ id: g1.id, name: g1.name }), del: () => delFilter(g1) }
        : {},
  );

  const subCols: ArCol<Subcategory>[] = [
    { k: "name", label: "Name", render: (t) => t.name, sort: (t) => t.name },
    { k: "group", label: "Filter group", render: (t) => groupName(t.group_id) || <span className="arc-grey">(none)</span>, sort: (t) => groupName(t.group_id) },
    { k: "n", label: "Products", right: true, render: (t) => t.products, sort: (t) => t.products },
    { k: "on", label: "On the shop", center: true, render: (t) => <Tick on={t.is_visible} />, sort: (t) => (t.is_visible ? 1 : 0) },
    { k: "page", label: "Page", render: (t) => <span className="arc-grey">/shop/{cat.slug}/{t.slug}/</span> },
  ];
  const filterCols: ArCol<SubGroup>[] = [
    { k: "name", label: "Name", render: (g) => g.name },
    { k: "n", label: "Sub-categories", right: true, render: (g) => tags.filter((t) => t.group_id === g.id).length },
  ];

  return (
    <>
      <div className="arc-sub-head">
        <b>
          {cat.name} · {products.length} product{products.length === 1 ? "" : "s"}
          {!cat.is_visible && " · hidden from the shop"}
        </b>
        <button type="button" onClick={onEdit}>
          Edit group
        </button>
      </div>
      <div className="ars-innertabs" role="tablist" aria-label={`${cat.name}`}>
        {(
          [
            ["subs", `Sub-categories (${tags.length})`],
            ["filters", `Filter groups (${groups.length})`],
            ...(cat.sold_in_boxes ? ([["boxes", "Box sizes"]] as const) : []),
          ] as [Pane, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={pane === id} className={pane === id ? "is-on" : ""} onClick={() => setPane(id)}>
            {label}
          </button>
        ))}
      </div>
      {err && <p className="adm-err">{err}</p>}

      {pane === "subs" && (
        <>
          <ArToolbar
            tools={[
              { icon: "add", label: "New sub-category", onClick: newSub },
              { icon: "edit", label: "Edit", disabled: !one, onClick: () => editSub(one) },
              { icon: "del", label: "Delete", disabled: !one, onClick: () => delSub(one) },
              canFill && { icon: "tag", label: "Fill from names", onClick: () => setFilling(true), title: "Suggest sub-categories from the product names; you check each before saving" },
            ]}
          />
          {!list ? (
            <p className="arc-note arc-pane">Loading.</p>
          ) : rows.length ? (
            <ArGrid cols={subCols} rows={rows} keyOf={(t) => t.id} sel={sel} onSel={setSel} onOpen={editSub} menu={subMenu} className="arc-grid" />
          ) : (
            <ArEmpty title="No sub-categories yet" action={canFill ? "Fill them from the product names" : "Add new sub-category"} onAction={canFill ? () => setFilling(true) : newSub} />
          )}
        </>
      )}
      {pane === "filters" && (
        <>
          <ArToolbar
            tools={[
              { icon: "add", label: "New filter group", onClick: () => setRename({ name: "" }) },
              { icon: "edit", label: "Rename", disabled: !g1, onClick: () => g1 && setRename({ id: g1.id, name: g1.name }) },
              { icon: "del", label: "Remove", disabled: !g1, onClick: () => delFilter(g1) },
            ]}
          />
          <p className="arc-note arc-pane">How shoppers filter (Material, Size…). Each sub-category can sit in one.</p>
          {groups.length ? <ArGrid cols={filterCols} rows={groups} keyOf={(g) => g.id} sel={gsel} onSel={setGsel} onOpen={(g) => setRename({ id: g.id, name: g.name })} menu={filterMenu} className="arc-grid" /> : <ArEmpty title="No filter groups" action="Add a filter group (like Size)" onAction={() => setRename({ name: "" })} />}
        </>
      )}
      {pane === "boxes" && <BoxPresets api={api} cat={cat} onAsk={onAsk} />}

      {sub && (
        <SubPanel
          key={sub.id ?? "new"}
          start={sub}
          groups={groups}
          catSlug={cat.slug}
          onClose={() => setSub(null)}
          onSave={(f) =>
            run(async () => {
              const patch = { name: f.name.trim(), group_id: f.group_id || null, is_visible: f.is_visible, seo_title: f.seo_title.trim(), seo_description: f.seo_description.trim() };
              if (f.id) await api.saveSubcategory(cat.id, { id: f.id, ...patch });
              else {
                const id = await api.saveSubcategory(cat.id, { name: patch.name, group_id: patch.group_id, sort_order: tags.length });
                if (!patch.is_visible || patch.seo_title || patch.seo_description) await api.saveSubcategory(cat.id, { id, is_visible: patch.is_visible, seo_title: patch.seo_title, seo_description: patch.seo_description });
              }
            }).then((ok) => {
              if (ok) {
                setSub(null);
                toast(f.id ? "Saved" : `${f.name.trim()} added`);
              }
            })
          }
        />
      )}
      <ArPanel
        open={rename !== null}
        title={rename?.id ? "Rename filter group" : "New filter group"}
        width="narrow"
        canSave={!!rename?.name.trim()}
        onClose={() => setRename(null)}
        onSave={() =>
          rename &&
          void run(() => api.saveSubGroup(cat.id, rename.id ? { id: rename.id, name: rename.name.trim() } : { name: rename.name.trim(), sort_order: groups.length })).then((ok) => ok && setRename(null))
        }
      >
        <ArField label="Name" invalid={!rename?.name.trim()}>
          <input className="adm-input" value={rename?.name ?? ""} maxLength={40} placeholder="e.g. Size" autoFocus onChange={(e) => rename && setRename({ ...rename, name: e.target.value })} />
        </ArField>
      </ArPanel>
      {filling && list && (
        <FillPanel
          api={api}
          cat={cat}
          list={list}
          products={products}
          onClose={() => setFilling(false)}
          onDone={() => {
            setFilling(false);
            void run(async () => {});
            void onTagged();
            toast("Sub-categories filled in");
          }}
        />
      )}
    </>
  );
}

// Fill from product names, Aronium's way: an info box with what will be
// made, then a grid of products with each suggested sub-category as a tick
// box; Save tags the ticked ones (useStarterFill, the same save as before)
function FillPanel({ api, cat, list, products, onClose, onDone }: { api: Api; cat: AdminCategory; list: List; products: AdminProduct[]; onClose: () => void; onDone: () => void }) {
  const f = useStarterFill({ api, categoryId: cat.id, categorySlug: cat.slug, list, products, onDone });
  type R = (typeof f.rows)[number];
  const cols: ArCol<R>[] = [
    { k: "name", label: "Product", render: (r) => r.p.name, sort: (r) => r.p.name },
    {
      k: "tags",
      label: "Sub-categories from the name",
      render: (r) => (
        <span className="arc-picks">
          {r.tags.map((t) => {
            const k = f.key(t.group, t.tag);
            return (
              <label key={k} title={t.group}>
                <input type="checkbox" checked={f.picked.get(r.p.id)?.has(k) ?? false} onChange={() => f.flip(r.p.id, k)} />
                {t.tag}
              </label>
            );
          })}
        </span>
      ),
    },
  ];
  return (
    <ArPanel
      open
      title="Fill from product names"
      width="wide"
      canSave={!!f.rows.length && !!f.tagged && !f.busy}
      saveLabel={f.busy ? "Saving…" : `Tag ${f.tagged} products`}
      onClose={onClose}
      onSave={f.rows.length ? () => void f.save() : undefined}
      banner={f.err ? <ArInfo tone="warn">{f.err}</ArInfo> : undefined}
    >
      <ArInfo>
        {f.rows.length
          ? `From their names: ${f.tagged} of ${products.length} products get sub-categories${f.toMake.length ? `, and ${f.toMake.length} new ones are made (${f.toMake.join(", ")})` : ""}. Untick anything wrong, then save. Sub-categories a product already has stay.`
          : "Nothing new to add from the product names."}
      </ArInfo>
      {f.rows.length > 0 && <ArGrid cols={cols} rows={f.rows} keyOf={(r) => r.p.id} className="arc-grid" />}
    </ArPanel>
  );
}

function SubPanel({ start, groups, catSlug, onClose, onSave }: { start: SubForm; groups: SubGroup[]; catSlug: string; onClose: () => void; onSave: (f: SubForm) => void }) {
  const [d, setD] = useState(start);
  const [tab, setTab] = useState("Details");
  return (
    <ArPanel open title={start.id ? `Edit "${start.name}"` : "New sub-category"} width="mid" tabs={["Details", "Shop page"]} tab={tab} onTab={setTab} canSave={!!d.name.trim()} onClose={onClose} onSave={() => onSave(d)}>
      {tab === "Details" ? (
        <>
          <ArField label="Name" invalid={!d.name.trim()}>
            <input className="adm-input" value={d.name} maxLength={40} placeholder="e.g. 14 inch" autoFocus onChange={(e) => setD({ ...d, name: e.target.value })} />
          </ArField>
          <ArField label="Filter group" size="mid">
            <select className="adm-input" value={d.group_id} onChange={(e) => setD({ ...d, group_id: e.target.value })}>
              <option value="">(none)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </ArField>
          <div className="ara-toggles">
            <ArSwitch on={d.is_visible} onChange={(v) => setD({ ...d, is_visible: v })} label="Shown on the shop (as a filter and its own page)" />
          </div>
        </>
      ) : (
        <>
          <ArInfo>
            Its page: /shop/{catSlug}/{d.slug ?? "…"}/. Leave these empty and they are made from the names.
          </ArInfo>
          <ArField label={`Title in Google (${d.seo_title.length}/70)`}>
            <input className="adm-input" value={d.seo_title} maxLength={70} onChange={(e) => setD({ ...d, seo_title: e.target.value })} />
          </ArField>
          <ArField label={`Description in Google (${d.seo_description.length}/170)`}>
            <textarea className="adm-input" rows={3} value={d.seo_description} maxLength={170} onChange={(e) => setD({ ...d, seo_description: e.target.value })} />
          </ArField>
        </>
      )}
    </ArPanel>
  );
}

// ---------------------------------------------------------------- the group panel
function GroupPanel({ api, start, cats, products, onAsk, onChanged, onClose, onSaved }: { api: Api; start: GroupForm; cats: AdminCategory[]; products: AdminProduct[]; onAsk: (a: Ask) => void; onChanged: () => Promise<unknown>; onClose: () => void; onSaved: (id?: string) => void }) {
  const [f, setF] = useState(start);
  const [tab, setTab] = useState("Details");
  const [busy, setBusy] = useState(false);
  const cat = cats.find((c) => c.id === start.id);
  async function save() {
    const name = f.name.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const rest = { tagline: f.tagline.trim() || null, is_visible: f.is_visible, sold_in_boxes: f.sold_in_boxes };
      if (f.id) {
        await api.updateCategory(f.id, { name, ...rest });
        toast(`${name} saved`);
        onSaved();
      } else {
        let slug = slugify(name);
        for (let n = 2; cats.some((c) => c.slug === slug); n++) slug = `${slugify(name)}-${n}`;
        await api.createCategory({ slug, name, sort_order: cats.length });
        const made = (await api.listCategories()).find((c) => c.slug === slug);
        if (made && (rest.tagline || !rest.is_visible || rest.sold_in_boxes)) await api.updateCategory(made.id, rest);
        toast(`${name} added`);
        onSaved(made?.id);
      }
    } catch (x) {
      toastError(errText(x));
      setBusy(false);
    }
  }
  const tabs = f.id ? ["Details", "Image & color", "Shop page", "Tax"] : ["Details", "Image & color", "Shop page"];
  return (
    <ArPanel open title={f.id ? `Edit "${start.name}"` : "New group"} width="mid" tabs={tabs} tab={tab} onTab={setTab} canSave={!!f.name.trim() && !busy} onClose={onClose} onSave={save}>
      {tab === "Details" && (
        <>
          <ArField label="Name" invalid={!f.name.trim()}>
            <input className="adm-input" value={f.name} maxLength={60} placeholder="e.g. Vaporizers" autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} />
          </ArField>
          <ArField label="Group" size="mid" hint="Babajee's groups sit at the top level.">
            <select className="adm-input" disabled value="root">
              <option value="root">Products</option>
            </select>
          </ArField>
          <div className="ara-toggles">
            <ArSwitch on={f.is_visible} onChange={(v) => setF({ ...f, is_visible: v })} label={f.is_visible ? "On the shop: shoppers see this group and its products" : "Hidden: its shelf isn't shown"} />
            <ArSwitch on={f.sold_in_boxes} onChange={(v) => setF({ ...f, sold_in_boxes: v })} label="Sold in boxes: its products can have box sizes (Box of 24, Box of 50)" />
          </div>
        </>
      )}
      {tab === "Image & color" && (
        <>
          <ArField label="Color" size="mid">
            <select className="adm-input" disabled>
              <option>Transparent</option>
            </select>
          </ArField>
          <ArField label="Image">
            <span className="arc-inline">
              <button type="button" className="arc-btn" disabled>
                Browse
              </button>
              <button type="button" className="arc-btn" disabled>
                Clear
              </button>
            </span>
          </ArField>
          <NotKept why="Babajee draws each group's card from the shop's design (Storefront), not from a colour or picture here." />
        </>
      )}
      {tab === "Shop page" && (
        <>
          <ArField label="Line under the name on the shop">
            <input className="adm-input" value={f.tagline} maxLength={90} placeholder="Every way to break it down." onChange={(e) => setF({ ...f, tagline: e.target.value })} />
          </ArField>
          {cat && <ArInfo>On the shop at /shop/{cat.slug}/</ArInfo>}
        </>
      )}
      {tab === "Tax" && cat && <GroupTax api={api} cat={cat} products={products} onAsk={onAsk} onChanged={onChanged} />}
    </ArPanel>
  );
}

// a group's tax: the HSN code, and the GST slab that goes with it, on every
// product in it (a single product can differ, on Product taxes)
function GroupTax({ api, cat, products, onAsk, onChanged }: { api: Api; cat: AdminCategory; products: AdminProduct[]; onAsk: (a: Ask) => void; onChanged: () => Promise<unknown> }) {
  const [shopRate, setShopRate] = useState(18);
  const [hsn, setHsn] = useState("");
  const [rate, setRate] = useState("");
  useEffect(() => {
    getSettings().then((s) => setShopRate(s.gst_rate), () => {});
  }, []);
  const rates = new Map<string, number>();
  for (const p of products) {
    const k = p.gst_rate == null ? "Shop default" : `${p.gst_rate}%`;
    rates.set(k, (rates.get(k) ?? 0) + 1);
  }
  const noHsn = products.filter((p) => !p.hsn).length;
  const ok = hsn.length >= 4;
  return (
    <>
      <ArInfo>
        Now: {[...rates.entries()].map(([k, v]) => `${k} on ${v}`).join(", ") || "no products"}
        {noHsn ? ` · ${noHsn} without an HSN code` : ""}. Under GST a product&apos;s slab follows its HSN code, so they are set together here. A single product can differ, on Product taxes (HSN).
      </ArInfo>
      <ArField label="HSN code" size="short" invalid={!ok}>
        <input className="adm-input" value={hsn} inputMode="numeric" maxLength={8} placeholder="e.g. 4813" onChange={(e) => setHsn(e.target.value.replace(/[^\d]/g, ""))} />
      </ArField>
      <ArField label="GST slab" size="mid">
        <select className="adm-input" value={rate} onChange={(e) => setRate(e.target.value)}>
          <option value="">Leave each product&apos;s slab</option>
          <option value="default">Shop default ({shopRate}%)</option>
          {GST_BRACKETS.map((b) => (
            <option key={b} value={b}>
              GST {b}%
            </option>
          ))}
        </select>
      </ArField>
      <span className="arc-inline">
        <button
          type="button"
          className="arc-btn"
          disabled={!products.length || !ok}
          onClick={() =>
            onAsk({
              title: `HSN ${hsn}${rate ? ` and GST ${rate === "default" ? `shop default (${shopRate}%)` : `${rate}%`}` : ""} on all ${products.length} ${cat.name}?`,
              body: "Orders already placed keep what they were charged.",
              label: "Set it",
              run: async () => {
                const patch = { hsn, ...(rate ? { gst_rate: rate === "default" ? null : Number(rate) } : {}) };
                for (const p of products) await api.updateProduct(p.id, patch);
                toast(`Set on ${products.length} products`);
                await onChanged();
              },
            })
          }
        >
          Set on all {products.length}
        </button>
      </span>
    </>
  );
}

// ---------------------------------------------------------------- box sizes
function BoxPresets({ api, cat, onAsk }: { api: Api; cat: AdminCategory; onAsk: (a: Ask) => void }) {
  const [list, setList] = useState<BoxPreset[] | null>(null);
  const [name, setName] = useState("");
  const [sizes, setSizes] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(() => api.listBoxPresets().then(setList, () => setList([])), [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const parsed = sizes
    .split(/[,\s/]+/)
    .map((x) => Math.round(Number(x)))
    .filter((x) => x > 1);
  const one = list?.find((p) => p.id === sel) ?? null;

  async function add() {
    if (!name.trim() || !parsed.length) return;
    try {
      await api.saveBoxPreset(name.trim(), [...new Set(parsed)].sort((a, b) => a - b));
      setName("");
      setSizes("");
      await load();
      toast("Preset saved");
    } catch (x) {
      toastError(errText(x));
    }
  }
  const putOn = (p: BoxPreset | null) =>
    p &&
    onAsk({
      title: `Put ${p.name} on all ${cat.name}?`,
      body: `Every product in ${cat.name} gets boxes of ${p.sizes.join(", ")}. Sizes a product already has are kept, with their prices.`,
      label: "Put them on",
      run: async () => {
        const n = await api.applyBoxPreset(p.id, { category: cat.id });
        toast(`${n} box size${n === 1 ? "" : "s"} added`);
      },
    });
  const del = (p: BoxPreset | null) =>
    p &&
    onAsk({
      title: `Delete the preset ${p.name}?`,
      body: "Products keep the box sizes they already have.",
      label: "Delete",
      danger: true,
      run: async () => {
        await api.deleteBoxPreset(p.id);
        await load();
      },
    });
  const menu = (p: BoxPreset | null): ArMenuItem[] =>
    menuOf([{ label: `Put on all ${cat.name}`, disabled: !p, onClick: () => putOn(p) }], [{ label: "Delete", key: "Del", disabled: !p, onClick: () => del(p) }], [{ label: "Refresh", key: "F5", onClick: () => void load() }]);

  return (
    <>
      <ArToolbar
        tools={[
          { icon: "box", label: `Put on all ${cat.name}`, disabled: !one, onClick: () => putOn(one) },
          { icon: "del", label: "Delete", disabled: !one, onClick: () => del(one) },
        ]}
      />
      <form
        className="arc-pane arc-inline"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input className="adm-input" value={name} maxLength={40} placeholder="Preset name, e.g. Papers" aria-label="Preset name" onChange={(e) => setName(e.target.value)} />
        <input className="adm-input" value={sizes} placeholder="Sizes, e.g. 24, 50" aria-label="Box sizes" onChange={(e) => setSizes(e.target.value)} />
        <button className="arc-btn" disabled={!name.trim() || !parsed.length}>
          + Add preset
        </button>
      </form>
      <p className="arc-note arc-pane">Presets of box sizes to put on products in one go. Each product can still have its own sizes and box prices.</p>
      {list === null ? (
        <p className="arc-note arc-pane">Loading.</p>
      ) : list.length ? (
        <ArGrid
          cols={[
            { k: "n", label: "Name", render: (p: BoxPreset) => p.name, sort: (p: BoxPreset) => p.name },
            { k: "s", label: "Box sizes", render: (p: BoxPreset) => `Boxes of ${p.sizes.join(", ")}` },
          ]}
          rows={list}
          keyOf={(p) => p.id}
          sel={sel}
          onSel={setSel}
          onOpen={putOn}
          menu={menu}
          className="arc-grid"
        />
      ) : (
        <ArEmpty title="No presets yet" />
      )}
    </>
  );
}

// a yes / no window, Aronium's: the question, then the button and Cancel
function AskDialog({ ask, onClose }: { ask: Ask | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={ask !== null} onClose={onClose}>
      {ask && (
        <form
          className="ara-dlg"
          method="dialog"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await ask.run();
            } catch (x) {
              toastError(errText(x));
            }
            setBusy(false);
            onClose();
          }}
        >
          <h2>{ask.title}</h2>
          <p className="ara-help">{ask.body}</p>
          <div className="ara-btns">
            <button className={`adm-btn ${ask.danger ? "bad" : "pri"}`} disabled={busy}>
              {ask.label}
            </button>
            <button type="button" className="adm-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
