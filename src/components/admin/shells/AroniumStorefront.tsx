"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory } from "@/lib/admin-data";
import { listCollections, type Collection } from "@/lib/collections";
import { deleteRow, getLook, listRows, reorder, saveLook, saveRow, SECTION_KINDS, type HomeSection, type Look, type SectionKind } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";
import { ArConfirm, ArSubTabs } from "./aronium-d-kit";
import ColourEditor from "@/components/admin/colours/ColourEditor";

// Storefront • Colours and homepage, in Aronium's layout: three tabs under
// the toolbar. Colours sets the shop's colours (ColourEditor, 0087). Announcement is Aronium's
// label-beside-field form for the line along the top. Homepage sections is
// a grid of the homepage's sections top to bottom: New section (pick a
// kind), Edit in the slide-in panel, Move up / down, Show / Hide (at once,
// with Undo), Delete (asked first).
type Tab = "colours" | "line" | "sections";
const COUNTED = ["best_sellers", "new_arrivals", "collection", "category"];

export default function AroniumStorefront() {
  const [tab, setTab] = useState<Tab>("colours");
  const [look, setLook] = useState<Look | null>(null);
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [cols, setCols] = useState<Collection[]>([]);
  const [err, setErr] = useState("");
  const [line, setLine] = useState({ announcement: "", announcement_link: "" });
  const [selS, setSelS] = useState<string | null>(null);
  const [edit, setEdit] = useState<HomeSection | null>(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<HomeSection | null>(null);
  const [help, setHelp] = useState(false);

  const loadLook = () =>
    getLook().then((l) => {
      setLook(l);
      setLine({ announcement: l.announcement, announcement_link: l.announcement_link });
    });
  const reload = () =>
    listRows("home_sections").then(
      (l) => {
        setSections(l);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  const loadAll = () => {
    void loadLook();
    void reload();
    adminApi().listCategories().then(setCats, () => {});
    listCollections().then(setCols, () => {});
  };
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveLine() {
    const link = line.announcement_link.trim();
    if (link && !/^(https:\/\/|\/)/.test(link)) {
      toastError("A link starts with / (a page on the shop) or https://");
      return;
    }
    try {
      await saveLook({ announcement: line.announcement.trim(), announcement_link: link });
      setLook((l) => (l ? { ...l, announcement: line.announcement.trim(), announcement_link: link } : l));
      toast(line.announcement.trim() ? "Announcement saved" : "Announcement taken down");
    } catch (x) {
      toastError(errText(x));
    }
  }

  const list = sections ?? [];
  async function update(s: HomeSection, patch: Partial<HomeSection>, said = "Saved", undoable = false) {
    setSections((l) => (l ?? []).map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
    try {
      await saveRow("home_sections", { id: s.id, ...patch });
      const was = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k as keyof HomeSection]])) as Partial<HomeSection>;
      toast(said, undoable ? { undo: () => void update({ ...s, ...patch }, was, "Undone") } : {});
    } catch (e) {
      toastError(errText(e));
      void reload();
    }
  }
  async function move(i: number, d: number) {
    if (i + d < 0 || i + d >= list.length) return;
    const next = list.slice();
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
      const id = await saveRow("home_sections", {
        kind,
        title: kind === "banners" || kind === "text" ? "" : k.label,
        ref: k.needsRef === "category" ? (cats[0]?.slug ?? "") : k.needsRef === "collection" ? (cols[0]?.slug ?? "") : "",
        position: list.length,
        item_count: 8,
        is_visible: true,
        body: "",
      });
      await reload();
      setSelS(id);
      toast(`${k.label} added at the bottom`);
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function remove(s: HomeSection) {
    try {
      await deleteRow("home_sections", s.id);
      setSelS(null);
      await reload();
    } catch (e) {
      toastError(errText(e));
    }
  }

  const kindOf = (s: HomeSection) => SECTION_KINDS.find((x) => x.kind === s.kind);
  const refName = (s: HomeSection) => {
    const k = kindOf(s);
    if (k?.needsRef === "category") return cats.find((c) => c.slug === s.ref)?.name ?? s.ref;
    if (k?.needsRef === "collection") return cols.find((c) => c.slug === s.ref)?.name ?? s.ref;
    return "";
  };
  const si = list.findIndex((s) => s.id === selS);
  const pickedS = si >= 0 ? list[si] : null;

  useArKeys({
    add: tab === "sections" ? () => setAdding(true) : undefined,
    del: tab === "sections" && pickedS ? () => setDel(pickedS) : undefined,
    edit: tab === "sections" && pickedS ? () => setEdit(pickedS) : undefined,
    refresh: loadAll,
  });

  const secCols: ArCol<HomeSection>[] = [
    { k: "pos", label: "#", right: true, render: (s) => list.indexOf(s) + 1 },
    { k: "kind", label: "Section", render: (s) => kindOf(s)?.label ?? s.kind },
    { k: "title", label: "Heading", render: (s) => (s.kind === "text" ? <span className="ard4-clip">{s.body}</span> : s.title) },
    { k: "ref", label: "Shows", render: refName },
    { k: "n", label: "Products", right: true, render: (s) => (COUNTED.includes(s.kind) ? s.item_count : "") },
    { k: "on", label: "Shown", center: true, render: (s) => <Tick on={s.is_visible} /> },
  ];
  const secMenu = (s: HomeSection | null) => {
    const i = s ? list.indexOf(s) : -1;
    return stdMenu({
      add: () => setAdding(true),
      addLabel: "New section",
      edit: () => s && setEdit(s),
      del: () => s && setDel(s),
      refresh: loadAll,
      has: !!s,
      extra: [
        { label: s?.is_visible ? "Hide" : "Show", onClick: () => s && update(s, { is_visible: !s.is_visible }, s.is_visible ? "Hidden from the homepage" : "Shown on the homepage", true), disabled: !s },
        { label: "Move up", onClick: () => move(i, -1), disabled: !s || i === 0 },
        { label: "Move down", onClick: () => move(i, 1), disabled: !s || i === list.length - 1 },
      ],
    });
  };

  const tools =
    tab === "colours"
      ? [
          { icon: "refresh", label: "Refresh", onClick: loadAll },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]
      : tab === "line"
        ? [
            { icon: "refresh", label: "Refresh", onClick: loadAll },
            { icon: "save", label: "Save", disabled: !look, onClick: () => void saveLine() },
            { icon: "clear", label: "Take down", disabled: !look?.announcement, onClick: () => setLine({ announcement: "", announcement_link: "" }) },
            { icon: "help", label: "Help", onClick: () => setHelp(true) },
          ]
        : [
            { icon: "refresh", label: "Refresh", onClick: loadAll },
            { icon: "add", label: "New section", onClick: () => setAdding(true) },
            { icon: "edit", label: "Edit", disabled: !pickedS, onClick: () => pickedS && setEdit(pickedS) },
            { icon: "del", label: "Delete", disabled: !pickedS, onClick: () => pickedS && setDel(pickedS) },
            { icon: "export", label: "Move up", disabled: !pickedS || si === 0, onClick: () => move(si, -1) },
            { icon: "import", label: "Move down", disabled: !pickedS || si === list.length - 1, onClick: () => move(si, 1) },
            {
              icon: "preview",
              label: pickedS?.is_visible ? "Hide" : "Show",
              disabled: !pickedS,
              onClick: () => pickedS && update(pickedS, { is_visible: !pickedS.is_visible }, pickedS.is_visible ? "Hidden from the homepage" : "Shown on the homepage", true),
            },
            { icon: "help", label: "Help", onClick: () => setHelp(true) },
          ];

  return (
    <ArScreen className="ard4">
      <ArToolbar tools={tools} />
      <ArSubTabs
        label="Colours and homepage"
        on={tab}
        onPick={setTab}
        tabs={[
          ["colours", "Colours"],
          ["line", "Announcement"],
          ["sections", "Homepage sections", list.length],
        ]}
      />
      {err && <p className="adm-err">{err}</p>}

      {tab === "colours" && (
        <>
          <ArSection title="Colours" />
          <ColourEditor aronium />
        </>
      )}

      {tab === "line" && (
        <form
          className="arf"
          onSubmit={(e) => {
            e.preventDefault();
            void saveLine();
          }}
        >
          <ArSection title="Announcement along the top" />
          <p className="arf-note">One short line on every page, like a sale or a holiday closing. Empty: none.</p>
          <label className="arf-row">
            <span>Announcement</span>
            <input className="adm-input" maxLength={160} value={line.announcement} placeholder="Free delivery on orders over ₹999 this week" onChange={(e) => setLine({ ...line, announcement: e.target.value })} />
          </label>
          <label className="arf-row">
            <span>Link (optional)</span>
            <input className="adm-input" maxLength={300} value={line.announcement_link} placeholder="/shop/bong/ or https://…" onChange={(e) => setLine({ ...line, announcement_link: e.target.value })} />
          </label>
          <label className="arf-row">
            <span />
            <span>
              <button className="adm-btn pri" disabled={!look}>
                Save
              </button>
            </span>
          </label>
        </form>
      )}

      {tab === "sections" && (
        <>
          <ArSection title="Homepage sections" n={list.length} />
          <p className="ard4-note">
            Top to bottom, for every design except Current (which is the painted walk-in). Banners come from <Link href="/admin/storefront/banners">Banners</Link>.
          </p>
          {sections === null && !err ? (
            <p className="ard4-loading">Loading…</p>
          ) : !list.length ? (
            <ArEmpty title="The homepage has no sections" action="Add a section" onAction={() => setAdding(true)} />
          ) : (
            <ArGrid cols={secCols} rows={list} keyOf={(s) => s.id} sel={selS} onSel={setSelS} onOpen={setEdit} menu={secMenu} className="ars-grid" />
          )}
        </>
      )}

      <ArPanel open={adding} title="New section" width="narrow" onClose={() => setAdding(false)}>
        <ArInfo>Pick what to add. It goes at the bottom of the homepage, shown; move it from the list.</ArInfo>
        <div className="ard4-kinds">
          {SECTION_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className="adm-btn"
              onClick={() => {
                setAdding(false);
                void add(k.kind);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </ArPanel>

      {edit && (
        <SectionPanel
          key={edit.id}
          s={edit}
          cats={cats}
          cols={cols}
          onClose={() => setEdit(null)}
          onSave={(patch) => update(edit, patch)}
          onShow={(on) => update(edit, { is_visible: on }, on ? "Shown on the homepage" : "Hidden from the homepage", true)}
        />
      )}

      <ArConfirm open={!!del} title={`Remove ${del ? (kindOf(del)?.label ?? del.kind) : "this section"}?`} yes="Remove" onYes={() => del && remove(del)} onClose={() => setDel(null)}>
        <p>It comes off the homepage. What it showed (products, banners) is untouched.</p>
      </ArConfirm>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Colours and homepage">
        <p>Colours: how the shop looks, light and dark. Pick a preset, change any part, look at it in the preview, then Save.</p>
        <p>Announcement: one short line along the top of every page. Leave it empty for none.</p>
        <p>Homepage sections: what the homepage shows, top to bottom, for every design except Current. Show and Hide save at once, with Undo; headings and words wait for Save in the editor.</p>
      </ArHelp>
    </ArScreen>
  );
}

function SectionPanel({ s, cats, cols, onClose, onSave, onShow }: { s: HomeSection; cats: AdminCategory[]; cols: Collection[]; onClose: () => void; onSave: (p: Partial<HomeSection>) => Promise<void>; onShow: (on: boolean) => Promise<void> }) {
  const k = SECTION_KINDS.find((x) => x.kind === s.kind);
  const [d, setD] = useState({ title: s.title, body: s.body, ref: s.ref, item_count: s.item_count, is_visible: s.is_visible });
  const dirty = d.title !== s.title || d.body !== s.body || d.ref !== s.ref || d.item_count !== s.item_count;
  return (
    <ArPanel
      open
      title={k?.label ?? s.kind}
      width="mid"
      canSave={dirty}
      onSave={async () => {
        await onSave({ title: d.title, body: d.body, ref: d.ref, item_count: d.item_count });
        onClose();
      }}
      onClose={onClose}
    >
      <div className="ara-toggles">
        <ArSwitch
          on={d.is_visible}
          label="Shown"
          onChange={(on) => {
            setD({ ...d, is_visible: on });
            void onShow(on);
          }}
        />
      </div>
      {s.kind !== "banners" && (
        <ArField label="Heading">
          <input className="adm-input" value={d.title} maxLength={120} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </ArField>
      )}
      {k?.needsRef === "category" && (
        <ArField label="Category" size="mid">
          <select className="adm-input" value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })}>
            {cats.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </ArField>
      )}
      {k?.needsRef === "collection" && (
        <ArField label="Collection" size="mid">
          <select className="adm-input" value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })}>
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
        </ArField>
      )}
      {COUNTED.includes(s.kind) && (
        <ArField label="How many" size="short">
          <select className="adm-input" value={d.item_count} onChange={(e) => setD({ ...d, item_count: Number(e.target.value) })}>
            {[4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n} products
              </option>
            ))}
          </select>
        </ArField>
      )}
      {s.kind === "text" && (
        <ArField label="Words">
          <textarea className="adm-input" rows={5} value={d.body} maxLength={2000} placeholder="A few words about the shop" onChange={(e) => setD({ ...d, body: e.target.value })} />
        </ArField>
      )}
      {s.kind === "banners" && (
        <ArInfo>
          The banners themselves are set on <Link href="/admin/storefront/banners">Banners</Link>.
        </ArInfo>
      )}
    </ArPanel>
  );
}
