"use client";

import { useCallback, useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { listSuppliers, saveSupplier, type Supplier } from "@/lib/stock-in/db";
import { ArEmpty, ArGrid, ArScreen, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Customers & suppliers • Suppliers: Aronium's Customers &
// suppliers grid showing only suppliers, with its New customer / supplier
// panel cut to what Babajee keeps for a supplier (name, GSTIN as the tax
// number, phone, notes, active). Delete deactivates: bills already posted
// keep their supplier, and a deactivated one can be made active again.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_MSG = "That GSTIN doesn't look right: it's 15 characters, like 27ABCDE1234F1Z5.";
type Form = { id?: string; name: string; gstin: string; phone: string; notes: string; active: boolean };
const BLANK: Form = { name: "", gstin: "", phone: "", notes: "", active: true };

export default function AroniumSuppliers() {
  const [list, setList] = useState<Supplier[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [off, setOff] = useState<Supplier | null>(null);
  const [inactive, setInactive] = useState(true);
  const [help, setHelp] = useState(false);

  const load = useCallback(
    () =>
      listSuppliers().then(
        (l) => (setList(l), setErr("")),
        (e) => (setErr(errText(e)), setList([])),
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const rows = (list ?? []).filter((s) => inactive || s.active);
  const picked = rows.find((s) => s.id === sel) ?? null;
  const edit = (s: Supplier | null) => s && setForm({ id: s.id, name: s.name, gstin: s.gstin, phone: s.phone, notes: s.notes, active: s.active });
  async function flip(s: Supplier) {
    try {
      await saveSupplier({ ...s, active: !s.active });
      toast(s.active ? `${s.name} deactivated` : `${s.name} is active again`);
      await load();
    } catch (x) {
      toastError(x);
    }
  }
  const del = () => picked && (picked.active ? setOff(picked) : void flip(picked));
  useArKeys({ add: () => setForm(BLANK), edit: () => edit(picked), del: () => picked?.active && setOff(picked), refresh: () => void load() });

  const cols: ArCol<Supplier>[] = [
    { k: "name", label: "Name", render: (s) => s.name, sort: (s) => s.name },
    { k: "tax", label: "Tax number", render: (s) => s.gstin || "", sort: (s) => s.gstin },
    { k: "phone", label: "Phone number", render: (s) => s.phone },
    { k: "notes", label: "Notes", render: (s) => s.notes },
    { k: "active", label: "Active", center: true, render: (s) => <Tick on={s.active} />, sort: (s) => (s.active ? 1 : 0) },
    { k: "cust", label: "Customer", center: true, render: () => <Tick on={false} /> },
  ];
  const menu = (s: Supplier | null) =>
    stdMenu({
      add: () => setForm(BLANK),
      edit: () => edit(s),
      editWith: [{ label: s && !s.active ? "Reactivate" : "Deactivate", disabled: !s, onClick: () => s && (s.active ? setOff(s) : void flip(s)) }],
      del: () => s?.active && setOff(s),
      refresh: () => void load(),
      has: !!s,
    });

  return (
    <ArScreen className="arc">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "Add", onClick: () => setForm(BLANK) },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => edit(picked) },
          { icon: "del", label: picked && !picked.active ? "Reactivate" : "Delete", disabled: !picked, onClick: del, title: "Delete deactivates: bills keep their supplier" },
          { icon: "truck", label: "Purchase bills", href: "/admin/inventory/purchases" },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      >
        <span className="ars-tool-switch">
          <ArSwitch on={inactive} onChange={setInactive} label="Show inactive" />
        </span>
      </ArToolbar>
      {err && <p className="adm-err">{err}</p>}
      <div className="art-sec">
        <h2>Suppliers ({rows.length})</h2>
        <i aria-hidden="true" />
      </div>
      {list === null ? (
        <p className="arc-note arc-pane">Loading.</p>
      ) : !rows.length ? (
        <ArEmpty title="No suppliers" action="Add new supplier" onAction={() => setForm(BLANK)} />
      ) : (
        <ArGrid cols={cols} rows={rows} keyOf={(s) => s.id} sel={sel} onSel={setSel} onOpen={edit} menu={menu} className="arc-grid" />
      )}

      {form && (
        <SupplierPanel
          key={form.id ?? "new"}
          start={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}

      <Dialog open={off !== null} onClose={() => setOff(null)}>
        {off && (
          <form
            className="ara-dlg"
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void flip(off);
              setOff(null);
            }}
          >
            <h2>Deactivate {off.name}?</h2>
            <p className="ara-help">New bills can&apos;t pick them. Bills already posted keep them, and they can be made active again.</p>
            <div className="ara-btns">
              <button className="adm-btn bad">Deactivate</button>
              <button type="button" className="adm-btn" onClick={() => setOff(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Suppliers">
        <p>Who the shop buys from, kept private to staff. Purchase bills pick their supplier from this list.</p>
        <p>The tax number is the supplier&apos;s GSTIN, needed to claim the GST on their bills; leave it empty if they have none.</p>
        <p>Delete deactivates a supplier, so bills already posted keep them; turn on Show inactive to see them, and Reactivate to bring one back.</p>
      </ArHelp>
    </ArScreen>
  );
}

function SupplierPanel({ start, onClose, onSaved }: { start: Form; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(start);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.name.trim() || busy) return;
    const gstin = f.gstin.trim().toUpperCase();
    if (gstin && !GSTIN_RE.test(gstin)) {
      setErr(GSTIN_MSG);
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await saveSupplier({ id: f.id, name: f.name.trim(), gstin, phone: f.phone.trim(), notes: f.notes.trim(), ...(f.id ? { active: f.active } : {}) });
      toast(f.id ? "Supplier saved" : `${f.name.trim()} added`);
      onSaved();
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  }
  return (
    <ArPanel open title={f.id ? `Edit "${start.name}"` : "New supplier"} width="wide" onClose={onClose} onSave={save} canSave={!!f.name.trim() && !busy} banner={err ? <ArInfo tone="warn">{err}</ArInfo> : undefined}>
      <h3>General info</h3>
      <ArField label="Name" invalid={!f.name.trim()}>
        <input className="adm-input" value={f.name} placeholder="Supplier name" autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} />
      </ArField>
      <ArField label="Tax number" size="mid" hint="GSTIN, needed to claim the GST on their bills. Leave empty if they have none.">
        <input className="adm-input" value={f.gstin} placeholder="27ABCDE1234F1Z5" maxLength={15} spellCheck={false} autoCapitalize="characters" onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })} />
      </ArField>
      <ArField label="Phone number" size="mid">
        <input className="adm-input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </ArField>
      <ArField label="Notes">
        <input className="adm-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </ArField>
      <div className="ara-toggles">
        <ArSwitch on={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" disabled={!f.id} title={f.id ? undefined : "A new supplier starts active"} />
        <ArSwitch on={false} label="Customer" disabled title="Customers are the shop's accounts, on Customers & suppliers" />
      </div>
    </ArPanel>
  );
}
