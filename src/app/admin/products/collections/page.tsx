"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { listProducts, type AdminProduct } from "@/lib/admin-data";
import { createCollection, deleteCollection, listCollections, setCollectionProducts, updateCollection, type Collection } from "@/lib/collections";
import { errText } from "@/lib/orders-db";

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

  useEffect(() => {
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
        Hand-picked lists of products, like Staff picks or Gift ideas. Switched-on collections show under the categories on the shop, with the products in the order you set.
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
            <input className="adm-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New collection, e.g. Staff picks" maxLength={60} />
            <button className="adm-btn pri" disabled={busy || !newName.trim()}>
              Add
            </button>
          </form>
        </aside>

        {open ? <Editor key={open.id} c={open} products={products} onSave={save} onDelete={remove} /> : list?.length === 0 ? null : <div />}
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

function Editor({ c, products, onSave, onDelete }: { c: Collection; products: AdminProduct[]; onSave: (c: Collection, p: Partial<Collection>, done?: string) => void; onDelete: (c: Collection) => void }) {
  const [name, setName] = useState(c.name);
  const [tagline, setTagline] = useState(c.tagline);
  const [find, setFind] = useState("");
  const [confirm, setConfirm] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const inIt = c.product_ids.map((id) => byId.get(id)).filter((p): p is AdminProduct => !!p);
  const q = find.trim().toLowerCase();
  const matches = q ? products.filter((p) => p.status !== "archived" && !c.product_ids.includes(p.id) && `${p.name} ${p.brand} ${p.category_name ?? ""}`.toLowerCase().includes(q)).slice(0, 8) : [];

  const move = (i: number, d: number) => {
    const ids = c.product_ids.slice();
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    onSave(c, { product_ids: ids });
  };

  return (
    <section className="adm-card col-edit">
      <div className="col-head">
        <input className="adm-input col-name" value={name} maxLength={60} aria-label="Collection name" onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== c.name && onSave(c, { name: name.trim() }, "Renamed")} />
        <button type="button" className={`adm-btn ${c.is_visible ? "pri" : ""}`} onClick={() => onSave(c, { is_visible: !c.is_visible }, c.is_visible ? `${c.name} taken off the shop` : `${c.name} is on the shop`)}>
          {c.is_visible ? "On the shop" : "Off the shop"}
        </button>
      </div>
      <label className="adm-label">
        Line under the name (optional)
        <input className="adm-input" value={tagline} maxLength={120} placeholder="What Baba himself reaches for." onChange={(e) => setTagline(e.target.value)} onBlur={() => tagline.trim() !== c.tagline && onSave(c, { tagline: tagline.trim() }, "Saved")} />
      </label>
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        On the shop at /shop/collection/{c.slug}
        {c.is_visible && !inIt.length ? " · add products, or it shows an empty shelf" : ""}
      </p>

      <h2 style={{ marginTop: 8 }}>
        {inIt.length} product{inIt.length === 1 ? "" : "s"}
      </h2>
      <div className="col-find">
        <input className="adm-input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Add a product: type its name" aria-label="Find a product to add" />
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
            <span className="col-move">
              <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label={`Move ${p.name} down`} disabled={i === inIt.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" aria-label={`Take ${p.name} out`} onClick={() => onSave(c, { product_ids: c.product_ids.filter((x) => x !== p.id) })}>
                ×
              </button>
            </span>
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
