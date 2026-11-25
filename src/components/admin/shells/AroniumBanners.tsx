"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { deleteRow, listRows, reorder, saveRow, uploadBannerImage, type Banner, type Tone } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import "@/components/admin/storefront.css";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";
import { ArConfirm } from "./aronium-d-kit";

// Storefront • Banners as an Aronium list: the homepage's rotating banners
// in the order they turn, a row each. New banner / Edit / Delete / Move up /
// Move down / Show on the homepage from the toolbar and the right-click
// menu; Edit opens Aronium's slide-in panel with a preview, the words, where
// it goes, the colour or picture and the dates it runs between. Showing or
// hiding saves at once (with Undo); the rest waits for Save.
const TONES: [Tone, string][] = [
  ["gold", "Gold"],
  ["green", "Green"],
  ["red", "Red"],
  ["ink", "Dark"],
  ["paper", "Paper"],
];
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function AroniumBanners() {
  const [list, setList] = useState<Banner[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Banner | null>(null);
  const [del, setDel] = useState<Banner | null>(null);
  const [help, setHelp] = useState(false);
  const load = () =>
    listRows("site_banners").then(
      (l) => {
        setList(l);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);

  const rows = list ?? [];
  const i = rows.findIndex((b) => b.id === sel);
  const picked = i >= 0 ? rows[i] : null;

  async function add() {
    try {
      const id = await saveRow("site_banners", { title: "New banner", subtitle: "", image_url: "", link_url: "/shop/", button_label: "Shop now", tone: "gold", position: rows.length, is_visible: false });
      const fresh = await listRows("site_banners");
      setList(fresh);
      setSel(id);
      setEdit(fresh.find((b) => b.id === id) ?? null);
      toast("Banner added, switched off until it's ready");
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function move(k: number, d: number) {
    if (k + d < 0 || k + d >= rows.length) return;
    const next = rows.slice();
    [next[k], next[k + d]] = [next[k + d], next[k]];
    setList(next);
    try {
      await reorder("site_banners", next.map((b) => b.id));
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function show(b: Banner, on: boolean) {
    setList((l) => (l ?? []).map((x) => (x.id === b.id ? { ...x, is_visible: on } : x)));
    try {
      await saveRow("site_banners", { id: b.id, is_visible: on });
      toast(on ? "Banner on the homepage" : "Banner off the homepage", { undo: () => void show({ ...b, is_visible: on }, !on) });
    } catch (e) {
      setList((l) => (l ?? []).map((x) => (x.id === b.id ? { ...x, is_visible: !on } : x)));
      toastError(errText(e));
    }
  }
  async function remove(b: Banner) {
    try {
      await deleteRow("site_banners", b.id);
      setSel(null);
      await load();
      toast("Banner deleted");
    } catch (e) {
      toastError(errText(e));
    }
  }
  useArKeys({ add: () => void add(), del: picked ? () => setDel(picked) : undefined, edit: picked ? () => setEdit(picked) : undefined, refresh: () => void load() });

  const cols: ArCol<Banner>[] = [
    { k: "pos", label: "#", right: true, render: (b) => rows.indexOf(b) + 1 },
    { k: "title", label: "Heading", render: (b) => b.title },
    { k: "sub", label: "Line under it", render: (b) => <span className="ard4-clip">{b.subtitle}</span> },
    { k: "btn", label: "Button", render: (b) => b.button_label },
    { k: "link", label: "Goes to", render: (b) => b.link_url },
    { k: "tone", label: "Colour", render: (b) => (b.image_url ? "Picture" : (TONES.find((t) => t[0] === b.tone)?.[1] ?? b.tone)) },
    { k: "start", label: "Starts", render: (b) => shortDate(b.starts_at) },
    { k: "end", label: "Ends", render: (b) => shortDate(b.ends_at) },
    { k: "on", label: "On the homepage", center: true, render: (b) => <Tick on={b.is_visible} /> },
  ];
  const menu = (b: Banner | null) => {
    const k = b ? rows.indexOf(b) : -1;
    return stdMenu({
      add: () => void add(),
      addLabel: "New banner",
      edit: () => b && setEdit(b),
      del: () => b && setDel(b),
      refresh: () => void load(),
      has: !!b,
      extra: [
        { label: b?.is_visible ? "Take off the homepage" : "Show on the homepage", onClick: () => b && show(b, !b.is_visible), disabled: !b },
        { label: "Move up", onClick: () => move(k, -1), disabled: !b || k === 0 },
        { label: "Move down", onClick: () => move(k, 1), disabled: !b || k === rows.length - 1 },
      ],
    });
  };

  return (
    <ArScreen className="ard4">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "New banner", onClick: () => void add() },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => picked && setEdit(picked) },
          { icon: "del", label: "Delete", disabled: !picked, onClick: () => picked && setDel(picked) },
          { icon: "export", label: "Move up", disabled: !picked || i === 0, onClick: () => move(i, -1) },
          { icon: "import", label: "Move down", disabled: !picked || i === rows.length - 1, onClick: () => move(i, 1) },
          { icon: "preview", label: picked?.is_visible ? "Hide" : "Show", disabled: !picked, onClick: () => picked && show(picked, !picked.is_visible) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <ArSection title="Banners" n={rows.length} />
      {list === null && !err ? (
        <p className="ard4-loading">Loading…</p>
      ) : !rows.length ? (
        <ArEmpty title="No banners yet" action="Add a banner" onAction={() => void add()} />
      ) : (
        <ArGrid cols={cols} rows={rows} keyOf={(b) => b.id} sel={sel} onSel={setSel} onOpen={setEdit} menu={menu} className="ars-grid" />
      )}

      {edit && <BannerPanel key={edit.id} b={edit} onClose={() => setEdit(null)} onShow={(on) => show(edit, on)} onSaved={load} />}

      <ArConfirm open={!!del} title={`Delete ${del?.title || "this banner"}?`} onYes={() => del && remove(del)} onClose={() => setDel(null)}>
        <p>It comes off the homepage and goes for good.</p>
      </ArConfirm>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Banners">
        <p>The banners that turn on the homepage, in this order: use Move up and Move down to change it. A banner with dates only shows between them.</p>
        <p>Show and Hide save at once, with Undo. Everything else in the editor waits for Save. A new banner starts hidden until it&apos;s ready.</p>
      </ArHelp>
    </ArScreen>
  );
}

function BannerPanel({ b, onClose, onShow, onSaved }: { b: Banner; onClose: () => void; onShow: (on: boolean) => Promise<void>; onSaved: () => Promise<void> | void }) {
  const [d, setD] = useState(b);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Banner>) => setD({ ...d, ...p });
  const dirty = JSON.stringify({ ...d, is_visible: b.is_visible }) !== JSON.stringify(b);

  async function save() {
    for (const u of [d.link_url, d.image_url])
      if (u && !/^(https:\/\/|\/)/.test(u)) {
        toastError("Links and pictures start with / (on the shop) or https://");
        return;
      }
    if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at) {
      toastError("The end comes after the start.");
      return;
    }
    setBusy(true);
    try {
      await saveRow("site_banners", { ...d, is_visible: b.is_visible });
      toast("Banner saved");
      await onSaved();
      onClose();
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const url = await uploadBannerImage(f);
      set({ image_url: url });
      toast("Picture uploaded: save the banner to use it");
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }

  return (
    <ArPanel open title={b.title || "Banner"} width="wide" canSave={dirty && !busy} onSave={save} onClose={onClose}>
      <div className="sfm-banner-preview ard4-preview" data-tone={d.tone} style={d.image_url ? { backgroundImage: `url("${d.image_url.replace(/"/g, "")}")` } : undefined}>
        <b>{d.title || "Heading"}</b>
        {d.subtitle && <span>{d.subtitle}</span>}
        {d.button_label && <span className="adm-small">→ {d.button_label}</span>}
      </div>
      <div className="ara-toggles">
        <ArSwitch
          on={d.is_visible}
          label="On the homepage"
          disabled={busy}
          onChange={(on) => {
            setD((x) => ({ ...x, is_visible: on }));
            void onShow(on);
          }}
        />
      </div>
      <ArField label="Heading">
        <input className="adm-input" maxLength={120} value={d.title} onChange={(e) => set({ title: e.target.value })} />
      </ArField>
      <ArField label="Line under it">
        <input className="adm-input" maxLength={240} value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
      </ArField>
      <ArField label="Button words" size="mid">
        <input className="adm-input" maxLength={40} value={d.button_label} onChange={(e) => set({ button_label: e.target.value })} />
      </ArField>
      <ArField label="Goes to" hint="A page on the shop (/shop/bong/) or https://…">
        <input className="adm-input" maxLength={300} value={d.link_url} placeholder="/shop/bong/" onChange={(e) => set({ link_url: e.target.value })} />
      </ArField>
      <ArField label="Colour" size="mid">
        <select className="adm-input" value={d.tone} onChange={(e) => set({ tone: e.target.value as Tone })}>
          {TONES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </ArField>
      <ArField label="Picture" hint={d.image_url ? "A picture is set: it shows instead of the colour." : "None: the colour shows."}>
        <span className="ard4-btnrow">
          <input className="adm-input" type="file" accept="image/*" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          {d.image_url && (
            <button type="button" className="adm-btn" onClick={() => set({ image_url: "" })}>
              Remove picture
            </button>
          )}
        </span>
      </ArField>
      <ArField label="Starts (optional)" size="mid">
        <input className="adm-input" type="datetime-local" value={local(d.starts_at)} onChange={(e) => set({ starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
      </ArField>
      <ArField label="Ends (optional)" size="mid">
        <input className="adm-input" type="datetime-local" value={local(d.ends_at)} onChange={(e) => set({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
      </ArField>
      {d.starts_at && d.ends_at && d.ends_at <= d.starts_at && <ArInfo tone="warn">The end comes after the start.</ArInfo>}
    </ArPanel>
  );
}
