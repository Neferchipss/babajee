"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog } from "@/components/admin/ui";
import { errText, getSettings, saveSettings } from "@/lib/orders-db";
import { can, useStaff } from "@/lib/staff";
import { ArEmpty, ArGrid, ArIcon, ArScreen, ArStepper, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";

// Management • Payment types, as Aronium has it: one row per way of paying,
// in the order "Mark paid" offers them. In Babajee these are the payment
// methods from Settings (0056): staff pick one when they mark an order paid.
// Babajee keeps a payment type's name and its position; Aronium's other
// settings describe a till (quick buttons, change, the cash drawer), so the
// editor shows them as they apply to an online order paid by hand, fixed.
// Move up / Move down are Babajee's own, in the toolbar and the menu.
type Row = { name: string; at: number };
const cash = (n: string) => /cash/i.test(n);
const TABS = ["General", "Rounding", "Icon"];
const ICONS = ["box", "list", "paid", "tag", "open", "edit", "hash", "barcode", "star", "calendar", "help", "info"];

export default function AroniumPaymentTypes() {
  const role = useStaff().me?.role ?? null;
  const may = can(role, "settings");
  const [list, setList] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ was: string | null; name: string; at: number } | null>(null);
  const [tab, setTab] = useState("General");
  const [del, setDel] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    getSettings().then(
      (s) => {
        setList(s.payment_methods);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);

  async function save(next: string[], msg: string) {
    setBusy(true);
    try {
      await saveSettings({ payment_methods: next });
      setList(next);
      toast(msg);
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  const rows: Row[] = (list ?? []).map((name, i) => ({ name, at: i + 1 }));
  const at = sel ? (list ?? []).indexOf(sel) : -1;
  const move = (name: string, d: -1 | 1) => {
    const i = (list ?? []).indexOf(name);
    if (!list || i < 0 || i + d < 0 || i + d >= list.length) return;
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    void save(next, `${name} moved ${d < 0 ? "up" : "down"}`);
  };
  const open = (r: Row | null) => {
    setTab("General");
    setEdit(r ? { was: r.name, name: r.name, at: r.at } : { was: null, name: "", at: rows.length + 1 });
  };
  const add = may ? () => open(null) : undefined;
  const editSel = may && sel ? () => open(rows.find((r) => r.name === sel) ?? null) : undefined;
  const delSel = may && sel ? () => setDel(sel) : undefined;
  useArKeys({ add, edit: editSel, del: delSel, refresh: () => void load() });

  const cols: ArCol<Row>[] = [
    { k: "name", label: "Name", render: (r) => r.name, sort: (r) => r.name },
    { k: "at", label: "Position", render: (r) => r.at, sort: (r) => r.at },
    { k: "code", label: "Code", render: () => "" },
    { k: "on", label: "Enabled", center: true, render: () => <Tick on /> },
    { k: "quick", label: "Quick payment", center: true, render: () => <Tick on /> },
    { k: "cust", label: "Customer required", center: true, render: () => <Tick on={false} /> },
    { k: "change", label: "Change allowed", center: true, render: (r) => <Tick on={cash(r.name)} /> },
    { k: "paid", label: "Mark transaction as paid", center: true, render: () => <Tick on /> },
    { k: "receipt", label: "Print receipt", center: true, render: () => <Tick on /> },
    { k: "key", label: "Shortcut key", render: () => "" },
  ];
  const menu = (r: Row | null) =>
    stdMenu({
      add,
      addLabel: "New payment type",
      edit: may ? () => r && open(r) : undefined,
      del: may ? () => r && setDel(r.name) : undefined,
      refresh: () => void load(),
      has: !!r,
      extra: may ? [{ label: "Move up", onClick: () => r && move(r.name, -1), disabled: !r || r.at === 1 }, { label: "Move down", onClick: () => r && move(r.name, 1), disabled: !r || r.at === rows.length }] : [],
    });

  const valid = !!edit?.name.trim();
  const isCash = cash(edit?.name ?? "");
  const fixed = "Babajee takes payment by hand, so this is fixed";

  return (
    <ArScreen>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "New payment type", disabled: !may, onClick: add, title: may ? undefined : "Only owners and admins change payment types" },
          { icon: "edit", label: "Edit", disabled: !editSel, onClick: editSel },
          { icon: "del", label: "Delete", disabled: !delSel || busy, onClick: delSel },
          { icon: "export", label: "Move up", disabled: !may || at <= 0 || busy, onClick: () => sel && move(sel, -1) },
          { icon: "import", label: "Move down", disabled: !may || at < 0 || at >= rows.length - 1 || busy, onClick: () => sel && move(sel, 1) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      {list && !rows.length ? (
        <ArEmpty title="No payment types" action={may ? "Add new payment type" : undefined} onAction={add} />
      ) : (
        <ArGrid cols={cols} rows={rows} keyOf={(r) => r.name} sel={sel} onSel={setSel} onOpen={(r) => may && open(r)} menu={menu} />
      )}

      <ArPanel
        open={edit !== null}
        title={edit?.was ? edit.was : "New payment type"}
        width="mid"
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        canSave={valid && !busy}
        onClose={() => setEdit(null)}
        onSave={() => {
          if (!edit || !list) return;
          const name = edit.name.trim();
          if (list.some((x) => x.toLowerCase() === name.toLowerCase() && x !== edit.was)) return toast(`${name} is already a payment type`, { tone: "info" });
          const without = edit.was ? list.map((x) => (x === edit.was ? name : x)).filter((x) => x !== name) : list;
          const pos = Math.max(0, Math.min(without.length, edit.at - 1));
          const next = [...without.slice(0, pos), name, ...without.slice(pos)];
          void save(next, edit.was ? `${name} saved` : `${name} added`).then(() => setSel(name));
          setEdit(null);
        }}
      >
        {edit && tab === "General" && (
          <>
            <ArField label="Name" invalid={!valid}>
              <input className="adm-input" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </ArField>
            <ArField label="Code" size="short">
              <input className="adm-input" disabled title="Babajee doesn't use payment codes" />
            </ArField>
            <ArField label="Shortcut key" size="short">
              <input className="adm-input" disabled title="Babajee doesn't use shortcut keys for payments" />
            </ArField>
            <ArField label="Position" hint="Where it sits in Mark paid's list.">
              <ArStepper label="Position" value={edit.at} min={1} max={edit.was ? rows.length : rows.length + 1} onChange={(v) => setEdit({ ...edit, at: v })} />
            </ArField>
            <div className="ara-toggles">
              <ArSwitch on label="Enabled" disabled title={fixed} />
              <ArSwitch on label="Quick payment" disabled title={fixed} />
            </div>
            <div className="ara-rule" />
            <div className="ara-toggles">
              <ArSwitch on={false} label="Customer required" disabled title="Every online order already has its customer" />
              <ArSwitch on label="Print receipt" disabled title={fixed} />
              <ArSwitch on={isCash} label="Change allowed" disabled title={fixed} />
              <ArSwitch on label="Mark transaction as paid" disabled title={fixed} />
              <ArSwitch on={isCash} label="Open cash drawer" disabled title={fixed} />
            </div>
          </>
        )}
        {edit && tab === "Rounding" && (
          <>
            <ArField label="Round to the nearest" size="mid">
              <select className="adm-input" disabled value="off">
                <option value="off">Off</option>
              </select>
            </ArField>
            <ArField label="Rounding rule" size="mid">
              <select className="adm-input" disabled value="none">
                <option value="none">None</option>
              </select>
            </ArField>
            <ArInfo>Babajee charges orders to the paisa, so payments aren&apos;t rounded.</ArInfo>
          </>
        )}
        {edit && tab === "Icon" && (
          <>
            <p className="ara-help">Select a shortcut icon for this payment method</p>
            <p className="ara-note">Note: Icons are only applicable to the &apos;Visual&apos; layout mode</p>
            <div className="ara-icons">
              {ICONS.map((i, k) => (
                <button key={i} type="button" disabled className={k === 2 ? "is-on" : ""} aria-label={i}>
                  <ArIcon name={i} size={30} />
                </button>
              ))}
            </div>
          </>
        )}
      </ArPanel>

      <Dialog open={del !== null} onClose={() => setDel(null)}>
        {del && (
          <form
            className="ara-dlg"
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              if (list) void save(list.filter((x) => x !== del), `${del} deleted`);
              setSel(null);
              setDel(null);
            }}
          >
            <h2>Delete {del}?</h2>
            <p className="ara-help">Staff can no longer pick it in Mark paid. Orders already paid this way keep it.</p>
            <div className="ara-btns">
              <button className="adm-btn bad">Delete</button>
              <button type="button" className="adm-btn" onClick={() => setDel(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Payment types">
        <p>The ways a customer can pay. Babajee takes payment by hand: the order is placed unpaid, someone contacts the customer, and staff mark it paid with one of these.</p>
        <p>Position is the order Mark paid lists them in: change it in the editor, or with Move up and Move down. The till settings (quick payment, change, the cash drawer) are shown as they apply online and can&apos;t be changed.</p>
      </ArHelp>
    </ArScreen>
  );
}
