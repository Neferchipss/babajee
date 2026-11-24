"use client";

import { useEffect, useRef, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { adminApi } from "@/lib/admin-api";
import { getLook, saveLook } from "@/lib/content";
import { isReadyMessage, PREVIEW_TYPE, type PreviewMessage } from "@/lib/colours-preview";
import { errText } from "@/lib/orders-db";
import { PRESETS, SLOTS, type Mode } from "@/lib/shop-colours";
import { can, useStaff } from "@/lib/staff";
import { normaliseHex, pickPreset, revert, setSlot, warnings, type Working } from "./editor-state";
import "./colours.css";

// Admin > Storefront > Colours (0087), in both admin designs: the shop's
// colours part by part, light and dark, from a preset or by hand, with a
// live preview of the real shop beside it (the shop framed with
// ?preview=colours, sent the working palette by message). Nothing reaches
// visitors until Save; Revert reads what is live again.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function ColourEditor({ aronium = false }: { aronium?: boolean }) {
  const may = can(useStaff().me?.role ?? null, "look");
  const [work, setWork] = useState<Working | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [mode, setMode] = useState<Mode>("dark");
  const [previewMode, setPreviewMode] = useState<Mode>("dark");
  const [pages, setPages] = useState<{ label: string; path: string }[]>([
    { label: "Home", path: "/" },
    { label: "Cart", path: "/cart/" },
  ]);
  const [page, setPage] = useState("/");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let live = true;
    revert(getLook).then(
      (w) => {
        if (!live) return;
        setWork(w);
        setSaved(JSON.stringify(w));
      },
      (e) => live && setLoadErr(errText(e)),
    );
    // a shelf and a product to look at, from the first category
    void (async () => {
      try {
        const api = adminApi();
        const cat = (await api.listCategories())[0];
        if (!cat) return;
        const prod = (await api.listProducts(cat.id))[0];
        if (!live) return;
        setPages([
          { label: "Home", path: "/" },
          { label: `Shelf: ${cat.name}`, path: `/shop/${cat.slug}/` },
          ...(prod ? [{ label: "A product", path: `/shop/${cat.slug}/${prod.slug}/` }] : []),
          { label: "Cart", path: "/cart/" },
        ]);
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, []);

  // the preview shows the working palette, in its own light or dark
  const send = () => {
    if (!work) return;
    const msg: PreviewMessage = { type: PREVIEW_TYPE, colours: work, mode: previewMode };
    frame.current?.contentWindow?.postMessage(msg, location.origin);
  };
  useEffect(send);
  // the frame says when it is listening; answer with the palette
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    const onReady = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && isReadyMessage(e, location.origin)) sendRef.current();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, []);

  if (!work) return loadErr ? <p className="adm-err">{`Couldn't read the shop's colours: ${loadErr}. Refresh to try again.`}</p> : <p className="adm-muted">Loading colours…</p>;
  const dirty = JSON.stringify(work) !== saved;
  const warn = warnings(work, mode);

  async function save() {
    if (!work) return;
    setBusy(true);
    try {
      await saveLook({ colours: work });
      setSaved(JSON.stringify(work));
      toast("Saved: the shop's colours are live");
    } catch (e) {
      toastError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    try {
      const w = await revert(getLook);
      setWork(w);
      setSaved(JSON.stringify(w));
      toast("Back to the colours that are live");
    } catch (e) {
      toastError(errText(e));
    }
  }

  const presetName = work.preset === "custom" ? "Custom" : (PRESETS.find((p) => p.id === work.preset)?.name ?? "Custom");

  return (
    <div className={`clr ${aronium ? "clr--ar" : ""}`}>
      <div className="clr-edit">
        <section className="clr-presets" aria-label="Presets">
          <h3>
            Presets <span className="adm-muted">· now: {presetName}</span>
          </h3>
          <div className="clr-preset-row">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={`clr-preset ${work.preset === p.id ? "is-on" : ""}`} disabled={!may} onClick={() => setWork(pickPreset(p.id))} aria-pressed={work.preset === p.id}>
                <span className="clr-chips" aria-hidden="true">
                  {(["page", "panels", "accent", "text"] as const).map((s) => (
                    <i key={s} style={{ background: p[mode][s] }} />
                  ))}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </section>

        <div className="clr-modes" role="tablist" aria-label="Which colours to edit">
          {(["light", "dark"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
              {m === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>

        <ul className="clr-slots">
          {SLOTS.map((s) => (
            <SlotRow key={`${mode}-${s.id}`} id={`clr-${mode}-${s.id}`} label={s.label} hint={s.hint} value={work[mode][s.id]} disabled={!may} onChange={(hex) => setWork(setSlot(work, mode, s.id, hex))} />
          ))}
        </ul>

        {warn.length > 0 && (
          <div className="clr-warn" role="status">
            <b>Hard to read ({mode === "light" ? "light" : "dark"}):</b>
            <ul>
              {warn.map((w) => (
                <li key={w.label}>
                  {w.label}: {w.ratio}:1, aim for {w.min}:1 or more
                </li>
              ))}
            </ul>
          </div>
        )}

        {may && (
          <div className="clr-actions">
            <button type="button" className="adm-btn pri" disabled={!dirty || busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="adm-btn" disabled={busy} onClick={() => void undo()}>
              Revert
            </button>
            {dirty && <span className="adm-muted adm-small">Not saved yet: visitors still see the live colours.</span>}
          </div>
        )}
      </div>

      <section className="clr-preview" aria-label="Preview">
        <div className="clr-preview-bar">
          <select className="adm-input" id="clr-page" value={page} onChange={(e) => setPage(e.target.value)} aria-label="Page to preview">
            {pages.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="clr-modes" role="tablist" aria-label="Preview in light or dark">
            {(["light", "dark"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={previewMode === m} className={previewMode === m ? "is-on" : ""} onClick={() => setPreviewMode(m)}>
                {m === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
        <iframe ref={frame} title="Preview of the shop" src={`${BASE}${page}?preview=colours`} onLoad={send} />
      </section>
    </div>
  );
}

function SlotRow({ id, label, hint, value, disabled, onChange }: { id: string; label: string; hint: string; value: string; disabled: boolean; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setText(value);
  }
  const bad = normaliseHex(text) === null;
  return (
    <li className="clr-slot">
      <span className="clr-slot-name">
        <label htmlFor={id}>{label}</label>
        <small className="adm-muted">{hint}</small>
      </span>
      <input type="color" value={value} disabled={disabled} aria-label={`${label}: pick a colour`} onChange={(e) => onChange(e.target.value)} />
      <input
        id={id}
        className={`adm-input clr-hex ${bad ? "is-bad" : ""}`}
        value={text}
        disabled={disabled}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          const hex = normaliseHex(e.target.value);
          if (hex) onChange(hex);
        }}
        onBlur={() => setText(value)}
      />
    </li>
  );
}

