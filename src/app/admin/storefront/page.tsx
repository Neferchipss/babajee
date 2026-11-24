"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory } from "@/lib/admin-data";
import { listCollections, type Collection } from "@/lib/collections";
import { deleteRow, getLook, listRows, reorder, saveLook, saveRow, SECTION_KINDS, type HomeSection, type Look, type SectionKind } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import "@/components/admin/storefront.css";
import AroniumStorefront from "@/components/admin/shells/AroniumStorefront";
import ColourEditor from "@/components/admin/colours/ColourEditor";
import { useAdminStyle } from "@/lib/admin-style";

// Storefront > Colours and homepage: the shop's colours (0087, ColourEditor),
// the line along the top, and the homepage's sections in order (0073).
export default function StorefrontPage() {
  return useAdminStyle() === "aronium" ? <AroniumStorefront /> : <StorefrontPageOriginal />;
}

function StorefrontPageOriginal() {
  const [look, setLook] = useState<Look | null>(null);
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [cols, setCols] = useState<Collection[]>([]);
  const [err, setErr] = useState("");
  const [line, setLine] = useState({ announcement: "", announcement_link: "" });

  useEffect(() => {
    getLook().then((l) => {
      setLook(l);
      setLine({ announcement: l.announcement, announcement_link: l.announcement_link });
    });
    listRows("home_sections").then(setSections, (e) => setErr(errText(e)));
    adminApi().listCategories().then(setCats, () => {});
    listCollections().then(setCols, () => {});
  }, []);

  async function saveLine(e: React.FormEvent) {
    e.preventDefault();
    const link = line.announcement_link.trim();
    if (link && !/^(https:\/\/|\/)/.test(link)) {
      toastError("A link starts with / (a page on the shop) or https://");
      return;
    }
    try {
      await saveLook({ announcement: line.announcement.trim(), announcement_link: link });
      toast(line.announcement.trim() ? "Announcement saved" : "Announcement taken down");
    } catch (x) {
      toastError(errText(x));
    }
  }

  const reload = () => listRows("home_sections").then(setSections);
  // the same rule as banners, menus and pages: a switch or picker saves at
  // once; typed words wait for Save (with Undo) so half a sentence never goes live
  const [drafts, setDrafts] = useState<Record<string, { title?: string; body?: string }>>({});
  const draftOf = (s: HomeSection) => ({ title: drafts[s.id]?.title ?? s.title, body: drafts[s.id]?.body ?? s.body });
  const dirty = (s: HomeSection) => draftOf(s).title !== s.title || draftOf(s).body !== s.body;
  const dropDraft = (id: string) =>
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
  async function update(s: HomeSection, patch: Partial<HomeSection>, said = "Saved", undoable = false) {
    setSections((l) => (l ?? []).map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
    try {
      await saveRow("home_sections", { id: s.id, ...patch });
      // a switch can be put back: the fields as they were before
      const was = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k as keyof HomeSection]])) as Partial<HomeSection>;
      toast(said, undoable ? { undo: () => void update({ ...s, ...patch }, was, "Undone") } : {});
    } catch (e) {
      toastError(errText(e));
      void reload();
    }
  }
  async function move(i: number, d: number) {
    if (!sections) return;
    const next = sections.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSections(next.map((s, k) => ({ ...s, position: k })));
    try {
      await reorder("home_sections", next.map((s) => s.id));
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function add(kind: SectionKind) {
    const k = SECTION_KINDS.find((x) => x.kind === kind)!;
    try {
      await saveRow("home_sections", {
        kind,
        title: kind === "banners" || kind === "text" ? "" : k.label,
        ref: k.needsRef === "category" ? (cats[0]?.slug ?? "") : k.needsRef === "collection" ? (cols[0]?.slug ?? "") : "",
        position: sections?.length ?? 0,
        item_count: 8,
        is_visible: true,
        body: "",
      });
      await reload();
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function remove(s: HomeSection) {
    try {
      await deleteRow("home_sections", s.id);
      await reload();
    } catch (e) {
      toastError(errText(e));
    }
  }

  return (
    <div className="sfm">
      <header className="adm-pagehead">
        <h1>Colours and homepage</h1>
        <p>Set the shop&apos;s colours, the line along its top, and what its homepage shows.</p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <section className="adm-card sfm-colours">
        <h2>Colours</h2>
        <p className="adm-muted adm-small">How the shop looks, light and dark. Pick a preset, change any part, look at it in the preview, then Save.</p>
        <ColourEditor />
      </section>

      <form className="adm-card sfm-line" onSubmit={saveLine}>
        <h2>Announcement along the top</h2>
        <p className="adm-muted adm-small">One short line on every page, like a sale or a holiday closing. Empty: none.</p>
        <input className="adm-input" maxLength={160} value={line.announcement} placeholder="Free delivery on orders over ₹999 this week" onChange={(e) => setLine({ ...line, announcement: e.target.value })} />
        <input className="adm-input" maxLength={300} value={line.announcement_link} placeholder="Link (optional): /shop/bong/ or https://…" onChange={(e) => setLine({ ...line, announcement_link: e.target.value })} />
        <button className="adm-btn pri" disabled={!look}>
          Save
        </button>
      </form>

      <section className="adm-card sfm-sections">
        <h2>Homepage sections</h2>
        <p className="adm-muted adm-small">
          Top to bottom, for every design except Current (which is the painted walk-in). Banners come from <Link href="/admin/storefront/banners">Banners</Link>.
        </p>
        {sections === null ? (
          <p className="adm-muted adm-small">Loading.</p>
        ) : (
          <ol>
            {sections.map((s, i) => {
              const k = SECTION_KINDS.find((x) => x.kind === s.kind);
              return (
                <li key={s.id} className={s.is_visible ? "" : "is-off"}>
                  <div className="sfm-sec-head">
                    <b>{k?.label ?? s.kind}</b>
                    <span className="col-move">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>
                        ↓
                      </button>
                      <button type="button" aria-label={`Remove ${k?.label}`} onClick={() => remove(s)}>
                        ×
                      </button>
                    </span>
                  </div>
                  <div className="sfm-sec-fields">
                    {s.kind !== "banners" && (
                      <input className="adm-input" value={draftOf(s).title} maxLength={120} placeholder="Heading" aria-label="Heading" onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: { ...d[s.id], title: e.target.value } }))} />
                    )}
                    {k?.needsRef === "category" && (
                      <select className="adm-input" value={s.ref} aria-label="Category" onChange={(e) => update(s, { ref: e.target.value })}>
                        {cats.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {k?.needsRef === "collection" && (
                      <select className="adm-input" value={s.ref} aria-label="Collection" onChange={(e) => update(s, { ref: e.target.value })}>
                        {cols.length ? (
                          cols.map((c) => (
                            <option key={c.id} value={c.slug}>
                              {c.name}
                            </option>
                          ))
                        ) : (
                          <option value="">No collections yet</option>
                        )}
                      </select>
                    )}
                    {["best_sellers", "new_arrivals", "collection", "category"].includes(s.kind) && (
                      <select className="adm-input" value={s.item_count} aria-label="How many" onChange={(e) => update(s, { item_count: Number(e.target.value) })}>
                        {[4, 6, 8, 12].map((n) => (
                          <option key={n} value={n}>
                            {n} products
                          </option>
                        ))}
                      </select>
                    )}
                    {s.kind === "text" && (
                      <textarea className="adm-input" rows={3} value={draftOf(s).body} maxLength={2000} placeholder="A few words about the shop" aria-label="Words" onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: { ...d[s.id], body: e.target.value } }))} />
                    )}
                    <label className="adm-small sfm-show">
                      <input type="checkbox" checked={s.is_visible} onChange={(e) => update(s, { is_visible: e.target.checked }, e.target.checked ? "Shown on the homepage" : "Hidden from the homepage", true)} /> Shown
                    </label>
                    {dirty(s) && (
                      <span className="adm-actions">
                        <button type="button" className="adm-btn" onClick={() => dropDraft(s.id)}>
                          Undo
                        </button>
                        <button
                          type="button"
                          className="adm-btn pri"
                          onClick={() => {
                            const d = draftOf(s);
                            dropDraft(s.id);
                            void update(s, { title: d.title, body: d.body });
                          }}
                        >
                          Save
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div className="adm-chips">
          {SECTION_KINDS.map((k) => (
            <button key={k.kind} type="button" className="adm-chip" onClick={() => add(k.kind)}>
              + {k.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
