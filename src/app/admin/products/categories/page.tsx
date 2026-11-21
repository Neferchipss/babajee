"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Confirm, Empty, Failed, GstPicker, Loading, PageHead, SaveBar, Toggle, useDraft } from "@/components/admin/kit";
import { StarterFill, useSubcategories } from "@/components/admin/Subcategories";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog } from "@/components/admin/ui";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, BoxPreset, SubGroup, Subcategory } from "@/lib/admin-data";
import { errText, getSettings } from "@/lib/orders-db";
import { slugify } from "@/lib/slug";
import { SUBCATEGORY_RULES } from "@/lib/subcategory-rules";
import "@/components/admin/admin-products.css";
import "./categories.css";

// Catalogue > Categories (UI redesign, stage 2): the one place the shop's
// types (its parent categories: Bongs, Rolling Papers…) and the
// sub-categories inside each are made and arranged. Products only pick from
// these. Per type: its details, sub-categories in their groups (each with its
// own search listing), boxes, and tax for its products.
export default function CategoriesPage() {
  return (
    <Suspense>
      <Categories />
    </Suspense>
  );
}

function Categories() {
  const api = adminApi();
  const router = useRouter();
  const params = useSearchParams();
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

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

  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [products]);
  const openId = params.get("id") ?? cats?.[0]?.id ?? "";
  const open = cats?.find((c) => c.id === openId) ?? null;
  const pick = (id: string) => router.replace(`/admin/products/categories?id=${id}`, { scroll: false });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !cats) return;
    setBusy(true);
    try {
      let slug = slugify(name);
      for (let n = 2; cats.some((c) => c.slug === slug); n++) slug = `${slugify(name)}-${n}`;
      await api.createCategory({ slug, name, sort_order: cats.length });
      await load();
      const made = (await api.listCategories()).find((c) => c.slug === slug);
      if (made) pick(made.id);
      setNewName("");
      toast(`${name} added`);
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  async function move(c: AdminCategory, d: -1 | 1) {
    if (!cats) return;
    try {
      await api.moveCategory(cats, c.id, d);
      await load();
    } catch (x) {
      toastError(errText(x));
    }
  }

  return (
    <div className="cat">
      <PageHead
        title="Categories"
        help="Each type of product (Bongs, Rolling Papers…) and the sub-categories inside it. Products pick their type and sub-categories from these lists; new ones are only made here."
      />
      {err && <Failed error={err} onRetry={load} />}
      {cats === null && !err ? (
        <Loading what="categories" />
      ) : cats ? (
        <div className="cat-layout">
          <aside className="adm-card cat-list" aria-label="Types">
            <ul>
              {cats.map((c, i) => (
                <li key={c.id} className={c.id === openId ? "is-on" : ""}>
                  <button type="button" className="cat-pick" aria-current={c.id === openId ? "true" : undefined} onClick={() => pick(c.id)}>
                    <span className="cat-pick-name">{c.name}</span>
                    <small>
                      {count.get(c.id) ?? 0} products
                      {!c.is_visible && " · hidden"}
                      {c.sold_in_boxes && " · boxes"}
                    </small>
                  </button>
                  <span className="cat-move">
                    <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(c, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${c.name} down`} disabled={i === cats.length - 1} onClick={() => move(c, 1)}>
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <form className="cat-new" onSubmit={add}>
              <input className="adm-input" value={newName} maxLength={60} placeholder="New type, e.g. Vaporizers" aria-label="New type" onChange={(e) => setNewName(e.target.value)} />
              <button className="adm-btn pri" disabled={busy || !newName.trim()}>
                Add
              </button>
            </form>
          </aside>
          {open ? (
            <TypeEditor
              key={open.id}
              api={api}
              cat={open}
              products={products.filter((p) => p.category_id === open.id)}
              onChanged={load}
              onDeleted={() => {
                router.replace("/admin/products/categories", { scroll: false });
                void load();
              }}
            />
          ) : (
            <Empty title="No types yet">Add the first one on the left.</Empty>
          )}
        </div>
      ) : null}
    </div>
  );
}

type Api = ReturnType<typeof adminApi>;

function TypeEditor({ api, cat, products, onChanged, onDeleted }: { api: Api; cat: AdminCategory; products: AdminProduct[]; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const saved = { name: cat.name, tagline: cat.tagline ?? "", is_visible: cat.is_visible, sold_in_boxes: !!cat.sold_in_boxes };
  const { draft, set, dirty, reset } = useDraft(saved);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (!draft.name.trim()) {
      toastError("A type needs a name.");
      return;
    }
    setBusy(true);
    try {
      await api.updateCategory(cat.id, { name: draft.name.trim(), tagline: draft.tagline.trim() || null, is_visible: draft.is_visible, sold_in_boxes: draft.sold_in_boxes });
      await onChanged();
      toast(`${draft.name.trim()} saved`);
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteCategory(cat.id);
      toast(`${cat.name} deleted`);
      setDeleting(false);
      onDeleted();
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  return (
    <div className="cat-edit">
      <section className="adm-card cat-card">
        <h2>Details</h2>
        <div className="cat-grid">
          <label className="adm-label">
            Name
            <input className="adm-input" value={draft.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="adm-label">
            Line under the name on the shop
            <input className="adm-input" value={draft.tagline} maxLength={90} placeholder="Every way to break it down." onChange={(e) => set({ tagline: e.target.value })} />
          </label>
        </div>
        <div className="cat-toggles">
          <Toggle on={draft.is_visible} label="On the shop" hint={draft.is_visible ? "Shoppers see this type and its products" : "Hidden: its shelf isn't shown"} onChange={(v) => set({ is_visible: v })} />
          <Toggle on={draft.sold_in_boxes} label="Comes in boxes" hint="Bought and stocked in boxes (Box of 24, Box of 50), sold as pieces. Selling a whole box is optional, per product" onChange={(v) => set({ sold_in_boxes: v })} />
        </div>
        <p className="adm-muted adm-small cat-addr">On the shop at /shop/{cat.slug}/</p>
        <SaveBar dirty={dirty} busy={busy} onSave={save} onDiscard={reset} />
      </section>

      <SubCategories api={api} cat={cat} products={products} onTagged={onChanged} />

      {draft.sold_in_boxes && <BoxPresets api={api} cat={cat} />}

      <TypeTax api={api} cat={cat} products={products} onChanged={onChanged} />

      <section className="adm-card cat-card cat-danger">
        <h2>Delete this type</h2>
        <p className="adm-muted adm-small">
          {products.length ? `It has ${products.length} products. Move them to another type first (on each product), then it can be deleted.` : "It has no products, so it can be deleted."}
        </p>
        <button type="button" className="adm-btn bad" disabled={products.length > 0} onClick={() => setDeleting(true)}>
          Delete {cat.name}
        </button>
      </section>
      <Confirm open={deleting} title={`Delete ${cat.name}?`} body="Its sub-categories go with it. This can't be undone." confirmLabel="Delete" busy={busy} onConfirm={remove} onCancel={() => setDeleting(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- sub-categories
function SubCategories({ api, cat, products, onTagged }: { api: Api; cat: AdminCategory; products: AdminProduct[]; onTagged: () => Promise<void> }) {
  const { list, err, run } = useSubcategories(api, cat.id);
  const [filling, setFilling] = useState(false);
  const [editing, setEditing] = useState<Subcategory | null>(null);
  const [deleting, setDeleting] = useState<Subcategory | null>(null);
  const [groupEdit, setGroupEdit] = useState<SubGroup | null>(null);
  const [groupDel, setGroupDel] = useState<SubGroup | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [groupName, setGroupName] = useState("");

  if (!list) return <section className="adm-card cat-card">{err ? <Failed error={err} /> : <Loading what="sub-categories" />}</section>;
  const { groups, tags } = list;
  const sections = [...groups.map((g) => ({ g, tags: tags.filter((t) => t.group_id === g.id) })), { g: null as SubGroup | null, tags: tags.filter((t) => !t.group_id) }];

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    void run(() => api.saveSubcategory(cat.id, { name: n, group_id: group || null, sort_order: tags.length })).then((ok) => {
      if (ok) {
        setName("");
        toast(`${n} added`);
      }
    });
  };
  const addGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const n = groupName.trim();
    if (!n) return;
    void run(() => api.saveSubGroup(cat.id, { name: n, sort_order: groups.length })).then((ok) => ok && setGroupName(""));
  };
  const move = (inGroup: Subcategory[], i: number, d: -1 | 1) => {
    const a = inGroup[i];
    const b = inGroup[i + d];
    if (!a || !b) return;
    void run(async () => {
      await api.saveSubcategory(cat.id, { id: a.id, sort_order: b.sort_order });
      await api.saveSubcategory(cat.id, { id: b.id, sort_order: a.sort_order });
    });
  };

  return (
    <section className="adm-card cat-card">
      <div className="cat-card-head">
        <div>
          <h2>Sub-categories</h2>
          <p className="adm-muted adm-small">Grouped the way shoppers filter (Material, Size…). A product can have several; each has its own page on the shop.</p>
        </div>
        {SUBCATEGORY_RULES[cat.slug] && !filling && (
          <button type="button" className="adm-btn" onClick={() => setFilling(true)}>
            Fill from product names…
          </button>
        )}
      </div>

      {filling && (
        <StarterFill
          api={api}
          categoryId={cat.id}
          categorySlug={cat.slug}
          list={list}
          products={products}
          onDone={() => {
            setFilling(false);
            void run(async () => {});
            void onTagged();
            toast("Sub-categories filled in");
          }}
          onCancel={() => setFilling(false)}
        />
      )}

      {!tags.length && !groups.length && !filling && (
        <Empty title="No sub-categories yet">{SUBCATEGORY_RULES[cat.slug] ? "Fill them from the product names (you check each before saving), or add them below." : "Add a group (like Size) and the sub-categories in it below."}</Empty>
      )}

      {sections
        .filter((s) => s.g || s.tags.length)
        .map(({ g, tags: inGroup }) => (
          <div key={g?.id ?? "none"} className="cat-group">
            <div className="cat-group-head">
              <b>{g ? g.name : "Not in a group"}</b>
              {g && (
                <span className="cat-row-actions">
                  <button type="button" className="adm-btn" onClick={() => setGroupEdit(g)}>
                    Rename
                  </button>
                  <button type="button" className="adm-btn" onClick={() => setGroupDel(g)}>
                    Remove group
                  </button>
                </span>
              )}
            </div>
            {inGroup.length ? (
              <ul className="cat-subs">
                {inGroup.map((t, i) => (
                  <li key={t.id} className={t.is_visible ? "" : "is-hidden"}>
                    <span className="cat-sub-name">
                      {t.name}
                      <small>
                        {t.products} product{t.products === 1 ? "" : "s"}
                        {!t.is_visible && " · hidden from the shop"}
                      </small>
                    </span>
                    <span className="cat-row-actions">
                      <button type="button" className="cat-icon" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(inGroup, i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="cat-icon" aria-label={`Move ${t.name} down`} disabled={i === inGroup.length - 1} onClick={() => move(inGroup, i, 1)}>
                        ↓
                      </button>
                      <button type="button" className="adm-btn" onClick={() => setEditing(t)}>
                        Edit
                      </button>
                      <button type="button" className="adm-btn bad" onClick={() => setDeleting(t)}>
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adm-muted adm-small">Nothing in this group yet.</p>
            )}
          </div>
        ))}

      <div className="cat-adds">
        <form className="cat-add" onSubmit={add}>
          <input className="adm-input" value={name} maxLength={40} placeholder="New sub-category, e.g. 14 inch" aria-label="New sub-category" onChange={(e) => setName(e.target.value)} />
          <select className="adm-input" value={group} aria-label="Its group" onChange={(e) => setGroup(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button className="adm-btn pri" disabled={!name.trim()}>
            Add sub-category
          </button>
        </form>
        <form className="cat-add" onSubmit={addGroup}>
          <input className="adm-input" value={groupName} maxLength={40} placeholder="New group, e.g. Size" aria-label="New group" onChange={(e) => setGroupName(e.target.value)} />
          <button className="adm-btn" disabled={!groupName.trim()}>
            Add group
          </button>
        </form>
      </div>
      {err && <p className="adm-err">{err}</p>}

      <SubEdit
        key={editing?.id ?? "none"}
        tag={editing}
        groups={groups}
        catSlug={cat.slug}
        onClose={() => setEditing(null)}
        onSave={(patch) =>
          run(() => api.saveSubcategory(cat.id, { id: editing!.id, ...patch })).then((ok) => {
            if (ok) {
              setEditing(null);
              toast("Saved");
            }
          })
        }
      />
      <GroupRename
        key={groupEdit?.id ?? "g"}
        group={groupEdit}
        onClose={() => setGroupEdit(null)}
        onSave={(n) => run(() => api.saveSubGroup(cat.id, { id: groupEdit!.id, name: n })).then((ok) => ok && setGroupEdit(null))}
      />
      <Confirm
        open={!!deleting}
        title={`Delete ${deleting?.name ?? ""}?`}
        body={deleting?.products ? `It comes off its ${deleting.products} product${deleting.products === 1 ? "" : "s"}, and its page on the shop goes.` : "Its page on the shop goes."}
        confirmLabel="Delete"
        onConfirm={() => run(() => api.deleteSubcategory(deleting!.id)).then(() => setDeleting(null))}
        onCancel={() => setDeleting(null)}
      />
      <Confirm
        open={!!groupDel}
        title={`Remove the group ${groupDel?.name ?? ""}?`}
        body="Its sub-categories stay, without a group."
        confirmLabel="Remove group"
        onConfirm={() => run(() => api.deleteSubGroup(groupDel!.id)).then(() => setGroupDel(null))}
        onCancel={() => setGroupDel(null)}
      />
    </section>
  );
}

function SubEdit({ tag, groups, catSlug, onClose, onSave }: { tag: Subcategory | null; groups: SubGroup[]; catSlug: string; onClose: () => void; onSave: (p: Partial<Subcategory>) => void }) {
  const [d, setD] = useState(() => ({ name: tag?.name ?? "", group_id: tag?.group_id ?? "", is_visible: tag?.is_visible ?? true, seo_title: tag?.seo_title ?? "", seo_description: tag?.seo_description ?? "" }));
  return (
    <Dialog open={!!tag} onClose={onClose}>
      {tag && (
        <form
          className="cat-dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (!d.name.trim()) return;
            onSave({ name: d.name.trim(), group_id: d.group_id || null, is_visible: d.is_visible, seo_title: d.seo_title.trim(), seo_description: d.seo_description.trim() });
          }}
        >
          <h2>{tag.name}</h2>
          <label className="adm-label">
            Name
            <input className="adm-input" value={d.name} maxLength={40} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </label>
          <label className="adm-label">
            Group
            <select className="adm-input" value={d.group_id} onChange={(e) => setD({ ...d, group_id: e.target.value })}>
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <Toggle on={d.is_visible} label="Shown on the shop" hint="As a filter and its own page" onChange={(v) => setD({ ...d, is_visible: v })} />
          <fieldset className="cat-seo">
            <legend>Search listing (optional)</legend>
            <p className="adm-muted adm-small">
              Its page: /shop/{catSlug}/{tag.slug}/. Empty: made from the names.
            </p>
            <label className="adm-label">
              Title in Google ({d.seo_title.length}/70)
              <input className="adm-input" value={d.seo_title} maxLength={70} onChange={(e) => setD({ ...d, seo_title: e.target.value })} />
            </label>
            <label className="adm-label">
              Description in Google ({d.seo_description.length}/170)
              <textarea className="adm-input" rows={2} value={d.seo_description} maxLength={170} onChange={(e) => setD({ ...d, seo_description: e.target.value })} />
            </label>
          </fieldset>
          <div className="adm-actions">
            <button type="button" className="adm-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="adm-btn pri" disabled={!d.name.trim()}>
              Save
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function GroupRename({ group, onClose, onSave }: { group: SubGroup | null; onClose: () => void; onSave: (n: string) => void }) {
  const [n, setN] = useState(group?.name ?? "");
  return (
    <Dialog open={!!group} onClose={onClose}>
      {group && (
        <form
          className="cat-dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (n.trim()) onSave(n.trim());
          }}
        >
          <h2>Rename the group</h2>
          <input className="adm-input" value={n} maxLength={40} aria-label="Group name" onChange={(e) => setN(e.target.value)} />
          <div className="adm-actions">
            <button type="button" className="adm-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="adm-btn pri" disabled={!n.trim()}>
              Save
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- boxes
function BoxPresets({ api, cat }: { api: Api; cat: AdminCategory }) {
  const [list, setList] = useState<BoxPreset[] | null>(null);
  const [name, setName] = useState("");
  const [sizes, setSizes] = useState("");
  const [deleting, setDeleting] = useState<BoxPreset | null>(null);
  const [applying, setApplying] = useState<BoxPreset | null>(null);
  const load = useCallback(() => api.listBoxPresets().then(setList, () => setList([])), [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const parsed = sizes
    .split(/[,\s/]+/)
    .map((x) => Math.round(Number(x)))
    .filter((x) => x > 1);

  async function add(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <section className="adm-card cat-card">
      <h2>Box sizes</h2>
      <p className="adm-muted adm-small">Presets of box sizes to put on products in one go. Each product can still have its own sizes and box prices.</p>
      {list === null ? (
        <Loading />
      ) : list.length ? (
        <ul className="cat-subs">
          {list.map((p) => (
            <li key={p.id}>
              <span className="cat-sub-name">
                {p.name}
                <small>Boxes of {p.sizes.join(", ")}</small>
              </span>
              <span className="cat-row-actions">
                <button type="button" className="adm-btn" onClick={() => setApplying(p)}>
                  Put on all {cat.name}
                </button>
                <button type="button" className="adm-btn bad" onClick={() => setDeleting(p)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-muted adm-small">No presets yet.</p>
      )}
      <form className="cat-add" onSubmit={add}>
        <input className="adm-input" value={name} maxLength={40} placeholder="Preset name, e.g. Papers" aria-label="Preset name" onChange={(e) => setName(e.target.value)} />
        <input className="adm-input" value={sizes} placeholder="Sizes, e.g. 24, 50" aria-label="Box sizes" onChange={(e) => setSizes(e.target.value)} />
        <button className="adm-btn" disabled={!name.trim() || !parsed.length}>
          Save preset
        </button>
      </form>
      <Confirm
        open={!!applying}
        danger={false}
        title={`Put ${applying?.name ?? ""} on all ${cat.name}?`}
        body={`Every product in ${cat.name} gets boxes of ${applying?.sizes.join(", ")}. Sizes a product already has are kept, with their prices.`}
        confirmLabel="Put them on"
        onConfirm={async () => {
          try {
            const n = await api.applyBoxPreset(applying!.id, { category: cat.id });
            toast(`${n} box size${n === 1 ? "" : "s"} added`);
          } catch (x) {
            toastError(errText(x));
          }
          setApplying(null);
        }}
        onCancel={() => setApplying(null)}
      />
      <Confirm
        open={!!deleting}
        title={`Delete the preset ${deleting?.name ?? ""}?`}
        body="Products keep the box sizes they already have."
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.deleteBoxPreset(deleting!.id);
            await load();
          } catch (x) {
            toastError(errText(x));
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

// ---------------------------------------------------------------- tax
function TypeTax({ api, cat, products, onChanged }: { api: Api; cat: AdminCategory; products: AdminProduct[]; onChanged: () => Promise<void> }) {
  const [shopRate, setShopRate] = useState(18);
  const [rate, setRate] = useState<number | null>(null);
  const [hsn, setHsn] = useState("");
  const [asking, setAsking] = useState<"rate" | "hsn" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSettings().then((s) => setShopRate(s.gst_rate), () => {});
  }, []);
  const rates = new Map<string, number>();
  for (const p of products) rates.set(p.gst_rate == null ? "Shop default" : `${p.gst_rate}%`, (rates.get(p.gst_rate == null ? "Shop default" : `${p.gst_rate}%`) ?? 0) + 1);
  const noHsn = products.filter((p) => !p.hsn).length;

  async function apply() {
    setBusy(true);
    try {
      for (const p of products) await api.updateProduct(p.id, asking === "rate" ? { gst_rate: rate } : { hsn: hsn.replace(/\s/g, "") });
      toast(`Set on ${products.length} products`);
      await onChanged();
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
    setAsking(null);
  }

  return (
    <section className="adm-card cat-card">
      <h2>Tax for its products</h2>
      <p className="adm-muted adm-small">
        Now: {[...rates.entries()].map(([k, v]) => `${k} on ${v}`).join(", ") || "no products"}
        {noHsn ? ` · ${noHsn} without an HSN code` : ""}. Set one rate or HSN for all of them here; a single product can differ on its own page.
      </p>
      <div className="cat-tax">
        <GstPicker value={rate} shopRate={shopRate} onChange={setRate} />
        <button type="button" className="adm-btn" disabled={!products.length} onClick={() => setAsking("rate")}>
          Set for all {products.length}
        </button>
      </div>
      <div className="cat-tax">
        <label className="adm-label">
          HSN code
          <input className="adm-input" value={hsn} inputMode="numeric" maxLength={8} placeholder="e.g. 4813" onChange={(e) => setHsn(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
        <button type="button" className="adm-btn" disabled={!products.length || hsn.length < 4} onClick={() => setAsking("hsn")}>
          Set for all {products.length}
        </button>
      </div>
      <Confirm
        open={!!asking}
        danger={false}
        busy={busy}
        title={asking === "rate" ? `GST ${rate == null ? `shop default (${shopRate}%)` : `${rate}%`} on all ${products.length} ${cat.name}?` : `HSN ${hsn} on all ${products.length} ${cat.name}?`}
        body="Orders already placed keep what they were charged."
        confirmLabel="Set it"
        onConfirm={apply}
        onCancel={() => setAsking(null)}
      />
    </section>
  );
}
