"use client";

import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { RulesEditor } from "@/components/admin/collection-rules";
import { listCategories, listProducts, type AdminCategory, type AdminProduct } from "@/lib/admin-data";
import {
  createCollection,
  deleteCollection,
  listAllTags,
  listCollectionRules,
  listCollections,
  MANUAL,
  saveCollectionRules,
  setCollectionProducts,
  updateCollection,
  type Collection,
  type CollectionRules,
  type TagOption,
} from "@/lib/collections";
import { errText } from "@/lib/orders-db";
import "@/components/admin/admin-products.css";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArSwitch, ArToolbar, menuOf, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";
import { ArConfirm } from "./aronium-d-kit";

// Products • Collections, laid out like Aronium's Price lists: the lists on
// top (a row a collection, in the shop's order), the selected one's products
// in a second grid under it, in their order. New collection / Edit / Delete /
// Move up / Move down / Show on the shop from the toolbar and right-click;
// Edit slides in the name, the line under it and how products are chosen
// (hand-picked, or automatic from rules on its own tab). A hand-picked
// collection takes products from the Add product box over its grid and
// orders them with the grid's right-click. Showing saves at once.
const STARTERS = ["Staff picks", "New in", "Gift ideas", "Under ₹499", "Best sellers"];

export default function AroniumCollections() {
  const [list, setList] = useState<Collection[] | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [selItem, setSelItem] = useState<string | null>(null);
  const [rules, setRules] = useState<Map<string, CollectionRules>>(new Map());
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [edit, setEdit] = useState<Collection | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Collection | null>(null);
  const [find, setFind] = useState("");
  const [help, setHelp] = useState(false);

  const load = () => {
    listCollectionRules().then(setRules);
    listCategories().then(setCats, () => {});
    listAllTags().then(setTags);
    listCollections().then(
      (l) => {
        setList(l);
        setErr("");
        setSel((s) => s ?? l[0]?.id ?? null);
      },
      (e) => setErr(errText(e)),
    );
    listProducts().then(setProducts, (e) => setErr(errText(e)));
  };
  useEffect(() => {
    load();
  }, []);

  const rows = list ?? [];
  const i = rows.findIndex((c) => c.id === sel);
  const open = i >= 0 ? rows[i] : null;
  const auto = open ? (rules.get(open.id) ?? MANUAL) : MANUAL;
  const replace = (c: Collection) => setList((l) => (l ?? []).map((x) => (x.id === c.id ? c : x)));
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const inIt = open ? open.product_ids.map((id) => byId.get(id)).filter((p): p is AdminProduct => !!p) : [];
  const q = find.trim().toLowerCase();
  const matches =
    q && open
      ? products.filter((p) => p.status !== "archived" && !open.product_ids.includes(p.id) && `${p.name} ${p.brand} ${p.category_name ?? ""}`.toLowerCase().includes(q)).slice(0, 8)
      : [];

  async function save(c: Collection, patch: Partial<Collection>, done?: string) {
    replace({ ...c, ...patch });
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
  async function add(name = newName) {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createCollection(name, rows.length);
      setList(await listCollections());
      setSel(id);
      setNewName("");
      setAdding(false);
      toast("Collection added. It's off the shop until you switch it on.");
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }
  async function reorder(k: number, d: number) {
    if (k + d < 0 || k + d >= rows.length) return;
    const next = rows.slice();
    [next[k], next[k + d]] = [next[k + d], next[k]];
    const ordered = next.map((c, n) => ({ ...c, sort_order: n }));
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
      const rest = rows.filter((x) => x.id !== c.id);
      setList(rest);
      setSel(rest[0]?.id ?? null);
      toast(`${c.name} deleted. Its products are untouched.`);
    } catch (e) {
      toastError(errText(e));
    }
  }
  const onRules = async (c: Collection, r: CollectionRules) => {
    await saveCollectionRules(c.id, r);
    setRules((m) => new Map(m).set(c.id, r));
    setList(await listCollections());
  };
  const showIt = (c: Collection) => save(c, { is_visible: !c.is_visible }, c.is_visible ? `${c.name} taken off the shop` : `${c.name} is on the shop`);
  const moveItem = (k: number, d: number) => {
    if (!open || k + d < 0 || k + d >= open.product_ids.length) return;
    const ids = open.product_ids.slice();
    [ids[k], ids[k + d]] = [ids[k + d], ids[k]];
    void save(open, { product_ids: ids });
  };
  const takeOut = (p: AdminProduct) => open && save(open, { product_ids: open.product_ids.filter((x) => x !== p.id) });
  useArKeys({ add: () => setAdding(true), del: open ? () => setDel(open) : undefined, edit: open ? () => setEdit(open) : undefined, refresh: load });

  const cols: ArCol<Collection>[] = [
    { k: "pos", label: "#", right: true, render: (c) => rows.indexOf(c) + 1 },
    { k: "name", label: "Name", render: (c) => c.name, sort: (c) => c.name.toLowerCase() },
    { k: "line", label: "Line under the name", render: (c) => <span className="ard4-clip">{c.tagline}</span> },
    { k: "mode", label: "Products chosen", render: (c) => ((rules.get(c.id) ?? MANUAL).mode === "auto" ? "Automatic, from rules" : "Hand-picked") },
    { k: "n", label: "Products", right: true, render: (c) => c.product_ids.length, sort: (c) => c.product_ids.length },
    { k: "on", label: "On the shop", center: true, render: (c) => <Tick on={c.is_visible} /> },
  ];
  const menu = (c: Collection | null) => {
    const k = c ? rows.indexOf(c) : -1;
    return stdMenu({
      add: () => setAdding(true),
      addLabel: "New collection",
      edit: () => c && setEdit(c),
      del: () => c && setDel(c),
      refresh: load,
      has: !!c,
      extra: [
        { label: c?.is_visible ? "Take off the shop" : "Show on the shop", onClick: () => c && showIt(c), disabled: !c },
        { label: "Move up", onClick: () => reorder(k, -1), disabled: !c || k === 0 },
        { label: "Move down", onClick: () => reorder(k, 1), disabled: !c || k === rows.length - 1 },
      ],
    });
  };
  const manual = auto.mode === "manual";
  const itemCols: ArCol<AdminProduct>[] = [
    { k: "pos", label: "#", right: true, render: (p) => inIt.indexOf(p) + 1 },
    { k: "name", label: "Product", render: (p) => p.name },
    { k: "cat", label: "Category", render: (p) => p.category_name ?? "" },
    { k: "status", label: "On the shop", render: (p) => (p.status === "published" ? "Yes" : p.status === "draft" ? "Draft, not shown" : "Archived, not shown") },
  ];
  const itemMenu = (p: AdminProduct | null) => {
    const k = p ? inIt.indexOf(p) : -1;
    return manual
      ? menuOf(
          [
            { label: "Move up", onClick: () => moveItem(k, -1), disabled: !p || k === 0 },
            { label: "Move down", onClick: () => moveItem(k, 1), disabled: !p || k === inIt.length - 1 },
          ],
          [{ label: "Take out of the collection", key: "Del", onClick: () => p && takeOut(p), disabled: !p }],
        )
      : menuOf([{ label: "Edit rules", onClick: () => open && setEdit(open), disabled: !open }]);
  };
  const ii = inIt.findIndex((p) => p.id === selItem);

  return (
    <ArScreen className="ard4">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: load },
          { icon: "add", label: "New collection", onClick: () => setAdding(true) },
          { icon: "edit", label: "Edit", disabled: !open, onClick: () => open && setEdit(open) },
          { icon: "del", label: "Delete", disabled: !open, onClick: () => open && setDel(open) },
          { icon: "export", label: "Move up", disabled: !open || i === 0, onClick: () => reorder(i, -1) },
          { icon: "import", label: "Move down", disabled: !open || i === rows.length - 1, onClick: () => reorder(i, 1) },
          { icon: "preview", label: open?.is_visible ? "Take off shop" : "Show on shop", disabled: !open, onClick: () => open && showIt(open) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <ArSection title="Collections" n={rows.length} />
      {list === null && !err ? (
        <p className="ard4-loading">Loading…</p>
      ) : !rows.length ? (
        <ArEmpty title="No collections yet" action="Add a collection" onAction={() => setAdding(true)} />
      ) : (
        <ArGrid cols={cols} rows={rows} keyOf={(c) => c.id} sel={sel} onSel={(k) => (setSel(k), setSelItem(null), setFind(""))} onOpen={setEdit} menu={menu} className="ard4-top" />
      )}

      {open && (
        <div className="ard4-items">
          <ArSection title={`Products in ${open.name}`} n={inIt.length}>
            {manual ? (
              <span className="ard4-find">
                <input className="adm-input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Add product: type its name" aria-label="Find a product to add" />
                {matches.length > 0 && (
                  <ul className="ard4-drop" role="listbox">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            void save(open, { product_ids: [...open.product_ids, p.id] });
                            setFind("");
                          }}
                        >
                          {p.name}
                          <small> · {p.category_name}</small>
                          {p.status === "draft" && <small> · draft</small>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            ) : (
              <span className="ard4-note">Chosen by the rules, kept up to date by themselves</span>
            )}
            {manual && (
              <span className="ard4-btnrow">
                <button type="button" className="adm-btn" disabled={ii < 1} onClick={() => moveItem(ii, -1)}>
                  ↑ Up
                </button>
                <button type="button" className="adm-btn" disabled={ii < 0 || ii === inIt.length - 1} onClick={() => moveItem(ii, 1)}>
                  ↓ Down
                </button>
                <button type="button" className="adm-btn" disabled={ii < 0} onClick={() => ii >= 0 && takeOut(inIt[ii])}>
                  Take out
                </button>
              </span>
            )}
          </ArSection>
          {open.is_visible && !inIt.length && <ArInfo tone="warn">On the shop with no products: add products, or it shows an empty shelf.</ArInfo>}
          {inIt.length ? (
            <ArGrid cols={itemCols} rows={inIt} keyOf={(p) => p.id} sel={selItem} onSel={setSelItem} menu={itemMenu} className="ars-grid" />
          ) : (
            <ArEmpty title={manual ? "No products in it yet" : "No products match the rules"} action={manual ? undefined : "Edit rules"} onAction={() => setEdit(open)} />
          )}
        </div>
      )}

      <ArPanel
        open={adding}
        title="New collection"
        width="narrow"
        saveLabel="Add"
        canSave={!busy && !!newName.trim()}
        onSave={() => void add()}
        onClose={() => setAdding(false)}
      >
        <ArField label="Name" invalid={!newName.trim()}>
          <input className="adm-input" value={newName} maxLength={60} placeholder="e.g. Staff picks" onChange={(e) => setNewName(e.target.value)} autoFocus />
        </ArField>
        {!rows.length && (
          <>
            <ArInfo>Start with one of these, or name your own.</ArInfo>
            <div className="ard4-kinds">
              {STARTERS.map((n) => (
                <button key={n} type="button" className="adm-btn" disabled={busy} onClick={() => void add(n)}>
                  {n}
                </button>
              ))}
            </div>
          </>
        )}
      </ArPanel>

      {edit && (
        <EditPanel
          key={edit.id}
          c={rows.find((x) => x.id === edit.id) ?? edit}
          auto={rules.get(edit.id) ?? MANUAL}
          cats={cats}
          tags={tags}
          onSave={save}
          onRules={(r) => onRules(edit, r)}
          onClose={() => setEdit(null)}
        />
      )}

      <ArConfirm open={!!del} title={`Delete ${del?.name ?? "this collection"}?`} onYes={() => del && remove(del)} onClose={() => setDel(null)}>
        <p>The collection goes; its products are untouched.</p>
      </ArConfirm>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Collections">
        <p>Hand-picked lists of products, like Staff picks or Gift ideas. Switched-on collections show under the categories on the shop, in this order, with the products in the order you set. A product can be in any number of collections; drafts and archived products never show.</p>
        <p>Select a collection to see its products underneath. A hand-picked one takes products from the Add product box; order them with Up and Down or a right-click. An automatic one fills itself from its rules (Edit, then Rules).</p>
      </ArHelp>
    </ArScreen>
  );
}

function EditPanel({
  c,
  auto,
  cats,
  tags,
  onSave,
  onRules,
  onClose,
}: {
  c: Collection;
  auto: CollectionRules;
  cats: AdminCategory[];
  tags: TagOption[];
  onSave: (c: Collection, p: Partial<Collection>, done?: string) => Promise<void>;
  onRules: (r: CollectionRules) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("Collection");
  const [name, setName] = useState(c.name);
  const [tagline, setTagline] = useState(c.tagline);
  const dirty = (name.trim() && name.trim() !== c.name) || tagline.trim() !== c.tagline;
  const mode = (m: CollectionRules["mode"]) =>
    auto.mode !== m &&
    onRules({ ...auto, mode: m }).then(
      () => toast(m === "manual" ? "Hand-picked: the products stay as they are now" : "Automatic: add rules on the Rules tab"),
      (e) => toastError(errText(e)),
    );
  return (
    <ArPanel
      open
      title={c.name}
      width="wide"
      tabs={["Collection", "Rules"]}
      tab={tab}
      onTab={setTab}
      canSave={!!dirty}
      onSave={async () => {
        await onSave(c, { name: name.trim() || c.name, tagline: tagline.trim() }, "Saved");
        onClose();
      }}
      onClose={onClose}
    >
      {tab === "Collection" ? (
        <>
          <div className="ara-toggles">
            <ArSwitch on={c.is_visible} label="On the shop" onChange={() => void onSave(c, { is_visible: !c.is_visible }, c.is_visible ? `${c.name} taken off the shop` : `${c.name} is on the shop`)} />
          </div>
          <ArField label="Name" invalid={!name.trim()}>
            <input className="adm-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </ArField>
          <ArField label="Line under the name (optional)">
            <input className="adm-input" value={tagline} maxLength={120} placeholder="What Baba himself reaches for." onChange={(e) => setTagline(e.target.value)} />
          </ArField>
          <ArInfo>On the shop at /shop/collections?c={c.slug}</ArInfo>
          <ArField label="How products are chosen">
            <span className="ard4-radios" role="radiogroup" aria-label="How products are chosen">
              <label>
                <input type="radio" name="col-mode" checked={auto.mode === "manual"} onChange={() => mode("manual")} /> Hand-picked
              </label>
              <label>
                <input type="radio" name="col-mode" checked={auto.mode === "auto"} onChange={() => mode("auto")} /> Automatic, from rules
              </label>
            </span>
          </ArField>
        </>
      ) : auto.mode === "auto" ? (
        <div className="ard4-rules">
          <RulesEditor c={c} auto={auto} cats={cats} tags={tags} onRules={onRules} />
        </div>
      ) : (
        <ArInfo>
          This collection is hand-picked. Choose Automatic, from rules on the Collection tab to fill it from rules instead (by category, tag, brand, price, stock, sales…).
        </ArInfo>
      )}
    </ArPanel>
  );
}
