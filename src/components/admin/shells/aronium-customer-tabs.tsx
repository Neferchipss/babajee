"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deviceName, from, useCustomerActivity, type ActivityRow, type ActivityVisit } from "@/components/admin/CustomerActivity";
import { CHANNELS, useSupportItems, type SupportItem } from "@/components/admin/SupportHistory";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { addCustomerNote, errText, setNoteStatus, type CustomerNote, type CustomerSaved, type Order, type SupportChannel } from "@/lib/orders-db";
import { ArEmpty, ArGrid, ArSection, ArSwitch, ArToolbar, menuOf, type ArCol, type ArMenuItem } from "./aronium-kit";
import { ArField, ArInfo, ArPanel } from "./aronium-help";
import "./aronium-screens-c.css";

// The customer card's Activity and Notes & support tabs in Aronium's look:
// the same data as Babajee's panels (useCustomerActivity, useSupportItems),
// drawn as Aronium's grids, toolbars and slide-in panels.

const SHOWN = 8; // visits shown before "Show all"
const clock = (at: string) => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

// ---------------------------------------------------------------- Activity
// Visits as Aronium's documents grid, the selected visit's steps under it
export function ArActivity({ id, orders, saved }: { id: string; orders: Order[]; saved: CustomerSaved[] }) {
  const { data, failed, visits } = useCustomerActivity(id, orders, saved);
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  if (failed) return <ArInfo tone="warn">Activity could not be loaded.</ArInfo>;
  if (!data) return <p className="arc-note">Loading.</p>;
  const shown = all ? visits : visits.slice(0, SHOWN);
  const visit = visits.find((v) => v.key === sel) ?? shown[0] ?? null;
  const vcols: ArCol<ActivityVisit>[] = [
    { k: "at", label: "Date", render: (v) => when(v.at), sort: (v) => v.at },
    { k: "dev", label: "Device", render: (v) => deviceName(v.device) },
    { k: "from", label: "Came from", render: (v) => (v.key.startsWith("x-") ? "" : from(v.referrer)) },
    { k: "n", label: "Steps", right: true, render: (v) => v.rows.length, sort: (v) => v.rows.length },
    { k: "o", label: "Ordered", center: true, render: (v) => (v.rows.some((r) => r.strong) ? "✓" : "") },
  ];
  const rcols: ArCol<ActivityRow & { i: number }>[] = [
    { k: "t", label: "Time", render: (r) => clock(r.at) },
    { k: "x", label: "What they did", render: (r) => (r.strong ? <b>{r.text}</b> : r.text) },
  ];
  return (
    <>
      <ArSection title="Activity" />
      <div className="arc-form">
        <div className="arc-row">
          <span>First found the shop</span>
          <span>{data.first ? `${when(data.first.at)}, ${from(data.first.referrer)}${data.first.device ? ` on ${data.first.device}` : ""}` : "Not recorded yet"}</span>
        </div>
        <div className="arc-row">
          <span>Last seen</span>
          <span>{data.last_seen ? when(data.last_seen) : "Not recorded yet"}</span>
        </div>
        <div className="arc-row">
          <span>Visits</span>
          <span>{data.visits}</span>
        </div>
      </div>
      {!visits.length ? (
        <ArEmpty title="Nothing yet. Their visits show here once they browse the shop while signed in." />
      ) : (
        <>
          <ArSection title="Visits" n={visits.length} />
          <ArGrid cols={vcols} rows={shown} keyOf={(v) => v.key} sel={visit?.key ?? null} onSel={setSel} className="arc-grid" />
          {visits.length > SHOWN && (
            <div className="arc-more">
              <button type="button" className="arc-btn" onClick={() => setAll((x) => !x)}>
                {all ? "Show fewer" : `Show all ${visits.length} visits`}
              </button>
            </div>
          )}
          <ArSection title="Visit steps" n={visit?.rows.length ?? 0} />
          {visit && <ArGrid cols={rcols} rows={visit.rows.map((r, i) => ({ ...r, i }))} keyOf={(r) => `${r.at}-${r.i}`} className="aro-items" />}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Notes & support
type Adding = { kind: "contact" | "note"; channel: SupportChannel; orderId: string; open: boolean; body: string };
const channelName = (c: SupportChannel) => CHANNELS.find(([k]) => k === c)?.[1] ?? "";

export function ArSupport({ customerId, userId, notes, orders, onChange }: { customerId: string; userId: string | undefined; notes: CustomerNote[]; orders: Order[]; onChange: () => Promise<unknown> }) {
  const router = useRouter();
  const items = useSupportItems(notes, orders);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [busy, setBusy] = useState(false);
  const one = items.find((i) => i.key === sel) ?? null;
  const waiting = notes.filter((n) => n.status === "open").length;
  const start = (kind: Adding["kind"]) => setAdding({ kind, channel: "whatsapp", orderId: "", open: false, body: "" });

  async function add() {
    if (!adding || !userId || !adding.body.trim()) return;
    const a = adding;
    setBusy(true);
    try {
      await addCustomerNote(customerId, userId, a.body.trim(), { kind: a.kind, channel: a.kind === "contact" ? a.channel : "", order_id: a.orderId || null, open: a.kind === "contact" && a.open });
      setAdding(null);
      await onChange();
      toast(a.kind === "contact" ? (a.open ? "Logged, waiting on a follow-up" : "Contact logged") : "Note added");
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }
  async function flip(n: CustomerNote | undefined) {
    if (!n?.status) return;
    try {
      await setNoteStatus(n.id, n.status === "open" ? "resolved" : "open");
      await onChange();
      toast(n.status === "open" ? "Marked as done" : "Opened again");
    } catch (x) {
      toastError(errText(x));
    }
  }
  const menu = (i: SupportItem | null): ArMenuItem[] =>
    menuOf(
      [
        { label: "Log a contact", onClick: () => start("contact") },
        { label: "Private note", onClick: () => start("note") },
      ],
      [{ label: i?.note?.status === "resolved" ? "Open again" : "Mark as done", disabled: !i?.note?.status, onClick: () => void flip(i?.note) }],
      [{ label: "Open order", disabled: !i?.order, onClick: () => i?.order && router.push(`/admin/orders/view?id=${i.order.id}`) }],
      [{ label: "Refresh", key: "F5", onClick: () => void onChange() }],
    );
  const cols: ArCol<SupportItem>[] = [
    { k: "at", label: "Date", render: (i) => when(i.at), sort: (i) => i.at },
    { k: "head", label: "What", render: (i) => <span className={i.tone === "bad" ? "arc-neg" : i.tone === "open" ? "arc-warn" : ""}>{i.head}</span>, sort: (i) => i.head },
    { k: "order", label: "Order", render: (i) => (i.order ? <Link href={`/admin/orders/view?id=${i.order.id}`}>{i.order.order_number}</Link> : "") },
    { k: "body", label: "Details", render: (i) => <span className="arc-pre">{i.body ?? ""}</span> },
  ];

  return (
    <>
      <ArToolbar
        tools={[
          { icon: "add", label: "Log a contact", disabled: !userId, onClick: () => start("contact") },
          { icon: "edit", label: "Private note", disabled: !userId, onClick: () => start("note") },
          { icon: "paid", label: one?.note?.status === "resolved" ? "Open again" : "Mark as done", disabled: !one?.note?.status, onClick: () => void flip(one?.note) },
          { icon: "open", label: "Open order", disabled: !one?.order, onClick: () => one?.order && router.push(`/admin/orders/view?id=${one.order.id}`) },
        ]}
      />
      {waiting > 0 && <ArInfo tone="warn">{waiting} to follow up.</ArInfo>}
      <ArSection title="Support history" n={items.length} />
      {items.length ? <ArGrid cols={cols} rows={items} keyOf={(i) => i.key} sel={sel} onSel={setSel} onOpen={(i) => i.order && router.push(`/admin/orders/view?id=${i.order.id}`)} menu={menu} className="arc-grid" /> : <ArEmpty title="Nothing yet" action="Log a contact" onAction={() => start("contact")} />}
      <p className="arc-note">Only staff see this. Contacts that need a follow-up count on the dashboard until marked as done.</p>

      <ArPanel
        open={adding !== null}
        title={adding?.kind === "note" ? "Private note" : "Log a contact"}
        width="narrow"
        tabs={["Log a contact", "Private note"]}
        tab={adding?.kind === "note" ? "Private note" : "Log a contact"}
        onTab={(t) => adding && setAdding({ ...adding, kind: t === "Private note" ? "note" : "contact" })}
        canSave={!!adding?.body.trim() && !busy}
        saveLabel={adding?.kind === "note" ? "Add note" : "Log it"}
        onClose={() => setAdding(null)}
        onSave={() => void add()}
      >
        {adding && (
          <>
            {adding.kind === "contact" && (
              <>
                <ArField label="How">
                  <select className="adm-input" value={adding.channel} onChange={(e) => setAdding({ ...adding, channel: e.target.value as SupportChannel })}>
                    {CHANNELS.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </ArField>
                <ArField label="About an order">
                  <select className="adm-input" value={adding.orderId} onChange={(e) => setAdding({ ...adding, orderId: e.target.value })}>
                    <option value="">Not about an order</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_number}
                      </option>
                    ))}
                  </select>
                </ArField>
              </>
            )}
            <ArField label={adding.kind === "contact" ? "Summary" : "Note"} invalid={!adding.body.trim()}>
              <textarea className="adm-input" rows={4} autoFocus value={adding.body} placeholder={adding.kind === "contact" ? "What was it about, and what did you agree?" : "Private note about this customer"} onChange={(e) => setAdding({ ...adding, body: e.target.value })} />
            </ArField>
            {adding.kind === "contact" && (
              <div className="ara-toggles">
                <ArSwitch on={adding.open} onChange={(v) => setAdding({ ...adding, open: v })} label="Needs a follow-up" />
              </div>
            )}
            <ArInfo>Only staff see this.{adding.kind === "contact" ? ` Logged as ${channelName(adding.channel)}.` : ""}</ArInfo>
          </>
        )}
      </ArPanel>
    </>
  );
}
