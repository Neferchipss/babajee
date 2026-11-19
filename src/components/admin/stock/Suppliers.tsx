"use client";

import { type FormEvent, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { errText } from "@/lib/orders-db";
import { saveSupplier, type Supplier } from "@/lib/stock-in/db";
import "./stockin.css";

// Inventory › Suppliers: who the shop buys from (kept private: staff only).
// Moved here from the purchase bills page; bills pick from this list.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_MSG = "That GSTIN doesn't look right: it's 15 characters, like 27ABCDE1234F1Z5.";

// ---------------------------------------------------------------- suppliers

type Form = { id?: string; name: string; gstin: string; phone: string; notes: string };
const BLANK: Form = { name: "", gstin: "", phone: "", notes: "" };

export default function Suppliers({ list, onChanged }: { list: Supplier[] | null; onChanged: () => void }) {
  const [form, setForm] = useState<Form | null>(null);
  return (
    <div className="sti-stack">
      {!form && (
        <div className="sti-top">
          <button type="button" className="adm-btn pri" onClick={() => setForm(BLANK)}>
            Add a supplier
          </button>
        </div>
      )}
      {form && <SupplierForm key={form.id ?? "new"} start={form} onDone={() => (setForm(null), onChanged())} onCancel={() => setForm(null)} />}
      {list === null ? (
        <p className="adm-muted adm-small">Loading.</p>
      ) : list.length === 0 ? (
        <p className="adm-muted">No suppliers yet.</p>
      ) : (
        <ul className="sti-list">
          {list.map((s) => (
            <li key={s.id} className="sti-item">
              <div className="sti-item-head">
                <b className={s.active ? "" : "sti-struck"}>{s.name}</b>
                {!s.active && <span className="adm-pill off">Deactivated</span>}
              </div>
              <div className="sti-item-sub">
                <span>{s.gstin || "No GSTIN"}</span>
                {s.phone && <span>{s.phone}</span>}
              </div>
              {s.notes && <small className="adm-muted">{s.notes}</small>}
              <SupplierActions s={s} onEdit={() => setForm({ id: s.id, name: s.name, gstin: s.gstin, phone: s.phone, notes: s.notes })} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SupplierActions({ s, onEdit, onChanged }: { s: Supplier; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    try {
      await saveSupplier({ ...s, active: !s.active });
      toast(s.active ? `${s.name} deactivated` : `${s.name} is active again`);
      onChanged();
    } catch (x) {
      toastError(x);
    }
    setBusy(false);
  }
  return (
    <div className="sti-item-actions">
      <button type="button" className="adm-btn" onClick={onEdit}>
        Edit
      </button>
      <button type="button" className="adm-btn" disabled={busy} onClick={flip}>
        {s.active ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}

function SupplierForm({ start, onDone, onCancel }: { start: Form; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState(start);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || busy) return;
    const gstin = f.gstin.trim().toUpperCase();
    if (gstin && !GSTIN_RE.test(gstin)) {
      setErr(GSTIN_MSG);
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await saveSupplier({ id: f.id, name: f.name.trim(), gstin, phone: f.phone.trim(), notes: f.notes.trim() });
      toast(f.id ? "Supplier saved" : `${f.name.trim()} added`);
      onDone();
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  }

  return (
    <form className="adm-card sti-form sti-stack" onSubmit={save}>
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{f.id ? "Edit supplier" : "Add a supplier"}</h2>
      {err && <p className="adm-err" role="alert" style={{ margin: 0 }}>{err}</p>}
      <label className="adm-label">
        Name
        <input className="adm-input" value={f.name} placeholder="Supplier name" autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label className="adm-label">
        GSTIN
        <input className="adm-input" value={f.gstin} placeholder="27ABCDE1234F1Z5" maxLength={15} spellCheck={false} autoCapitalize="characters" onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })} />
        <span className="adm-muted adm-small">Needed to claim the GST on their bills. Leave empty if they have none.</span>
      </label>
      <label className="adm-label">
        Phone
        <input className="adm-input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </label>
      <label className="adm-label">
        Notes
        <input className="adm-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </label>
      <div className="adm-actions">
        <button className="adm-btn pri" disabled={!f.name.trim() || busy} style={{ flex: 1 }}>
          {busy ? "Saving" : "Save supplier"}
        </button>
        <button type="button" className="adm-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
