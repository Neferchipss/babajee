"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { deleteRow, listRows, reorder, saveRow, uploadBannerImage, type Banner, type Tone } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import "@/components/admin/storefront.css";
import AroniumBanners from "@/components/admin/shells/AroniumBanners";
import { useAdminStyle } from "@/lib/admin-style";

// Storefront > Banners: the homepage's rotating banners (0073). Each has a
// picture (or a plain colour), a heading, a line, a button and where it goes,
// and can run between two dates (a sale, a festival).
const TONES: [Tone, string][] = [
  ["gold", "Gold"],
  ["green", "Green"],
  ["red", "Red"],
  ["ink", "Dark"],
  ["paper", "Paper"],
];
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function BannersPage() {
  return useAdminStyle() === "aronium" ? <AroniumBanners /> : <BannersPageOriginal />;
}

function BannersPageOriginal() {
  const [list, setList] = useState<Banner[] | null>(null);
  const [err, setErr] = useState("");
  const load = () => listRows("site_banners").then(setList, (e) => setErr(errText(e)));
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    try {
      await saveRow("site_banners", { title: "New banner", subtitle: "", image_url: "", link_url: "/shop/", button_label: "Shop now", tone: "gold", position: list?.length ?? 0, is_visible: false });
      await load();
      toast("Banner added, switched off until it's ready");
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function move(i: number, d: number) {
    if (!list) return;
    const next = list.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setList(next);
    try {
      await reorder("site_banners", next.map((b) => b.id));
    } catch (e) {
      toastError(errText(e));
    }
  }

  return (
    <div className="sfm">
      <header className="adm-pagehead">
        <h1>Banners</h1>
        <p>The banners that turn on the homepage, in this order. A banner with dates only shows between them.</p>
      </header>
      {err && <p className="adm-err">{err}</p>}
      {list === null ? (
        <p className="adm-muted">Loading.</p>
      ) : (
        <div className="sfm-list">
          {list.map((b, i) => (
            <BannerEditor key={b.id} b={b} first={i === 0} last={i === list.length - 1} onMove={(d) => move(i, d)} onChanged={load} />
          ))}
          {!list.length && <p className="adm-muted">No banners yet.</p>}
        </div>
      )}
      <button type="button" className="adm-btn pri" style={{ justifySelf: "start" }} onClick={add}>
        + Add a banner
      </button>
    </div>
  );
}

function BannerEditor({ b, first, last, onMove, onChanged }: { b: Banner; first: boolean; last: boolean; onMove: (d: number) => void; onChanged: () => void }) {
  const [d, setD] = useState(b);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(b);
  const set = (p: Partial<Banner>) => setD({ ...d, ...p });

  // On the homepage: saves at once, on its own (other edits wait for Save), with Undo
  async function show(on: boolean) {
    setD((x) => ({ ...x, is_visible: on }));
    try {
      await saveRow("site_banners", { id: d.id, is_visible: on });
      toast(on ? "Banner on the homepage" : "Banner off the homepage", { undo: () => void show(!on) });
      onChanged();
    } catch (e) {
      setD((x) => ({ ...x, is_visible: !on }));
      toastError(errText(e));
    }
  }
  async function save(patch: Partial<Banner> = {}) {
    const next = { ...d, ...patch };
    for (const u of [next.link_url, next.image_url])
      if (u && !/^(https:\/\/|\/)/.test(u)) {
        toastError("Links and pictures start with / (on the shop) or https://");
        return;
      }
    if (next.starts_at && next.ends_at && next.ends_at <= next.starts_at) {
      toastError("The end comes after the start.");
      return;
    }
    setBusy(true);
    try {
      await saveRow("site_banners", next);
      toast("Banner saved");
      onChanged();
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
    <article className="adm-card sfm-item">
      <div className="sfm-item-head">
        <label className="adm-small sfm-show">
          <input type="checkbox" checked={d.is_visible} disabled={busy} onChange={(e) => show(e.target.checked)} /> On the homepage
        </label>
        <span className="col-move">
          <button type="button" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
            ↓
          </button>
        </span>
      </div>
      <div className="sfm-banner-preview" data-tone={d.tone} style={d.image_url ? { backgroundImage: `url("${d.image_url.replace(/"/g, "")}")` } : undefined}>
        <b>{d.title || "Heading"}</b>
        {d.subtitle && <span>{d.subtitle}</span>}
        {d.button_label && <span className="adm-small">→ {d.button_label}</span>}
      </div>
      <div className="sfm-grid">
        <label className="adm-label">
          Heading
          <input className="adm-input" maxLength={120} value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="adm-label">
          Line under it
          <input className="adm-input" maxLength={240} value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        </label>
        <label className="adm-label">
          Button words
          <input className="adm-input" maxLength={40} value={d.button_label} onChange={(e) => set({ button_label: e.target.value })} />
        </label>
        <label className="adm-label">
          Goes to
          <input className="adm-input" maxLength={300} value={d.link_url} placeholder="/shop/bong/" onChange={(e) => set({ link_url: e.target.value })} />
        </label>
        <label className="adm-label">
          Colour
          <select className="adm-input" value={d.tone} onChange={(e) => set({ tone: e.target.value as Tone })}>
            {TONES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-label">
          Picture
          <input className="adm-input" type="file" accept="image/*" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <label className="adm-label">
          Starts (optional)
          <input className="adm-input" type="datetime-local" value={local(d.starts_at)} onChange={(e) => set({ starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </label>
        <label className="adm-label">
          Ends (optional)
          <input className="adm-input" type="datetime-local" value={local(d.ends_at)} onChange={(e) => set({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </label>
      </div>
      <div className="adm-actions">
        <button type="button" className="adm-btn pri" disabled={busy || !dirty} onClick={() => save()}>
          Save
        </button>
        {d.image_url && (
          <button type="button" className="adm-btn" onClick={() => set({ image_url: "" })}>
            Remove picture
          </button>
        )}
        {confirm ? (
          <>
            <button
              type="button"
              className="adm-btn bad"
              onClick={async () => {
                try {
                  await deleteRow("site_banners", b.id);
                  onChanged();
                } catch (e) {
                  toastError(errText(e));
                }
              }}
            >
              Delete banner
            </button>
            <button type="button" className="adm-btn" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="adm-btn" onClick={() => setConfirm(true)}>
            Delete…
          </button>
        )}
      </div>
    </article>
  );
}
