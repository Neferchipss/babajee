"use client";

import { useState } from "react";
import { money } from "@/components/admin/ui";
import { isoDay } from "@/lib/dates";
import { addCustomerNote, errText, markPaid, type Order, type SupportChannel } from "@/lib/orders-db";

// Manual payment (the client takes payment by hand, 0055/0056): the form that
// marks an unpaid order paid with how the money came in, and the one that logs
// a call or WhatsApp with the customer about paying. Both open in a Dialog,
// from the Payment pending tab and from the order itself.

export function MarkPaidForm({ order: o, methods, onDone, onCancel }: { order: Order; methods: string[]; onDone: () => void; onCancel: () => void }) {
  const [method, setMethod] = useState(methods[0] ?? "");
  const [other, setOther] = useState("");
  const [ref, setRef] = useState("");
  const [day, setDay] = useState(isoDay(0));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chosen = method === "__other" ? other.trim() : method;
  // cash has no transaction number; everything else usually does
  const wantsRef = !/cash/i.test(chosen);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!chosen) return setErr("Choose how it was paid.");
    setBusy(true);
    try {
      await markPaid(o.id, { method: chosen, reference: ref.trim(), received: day, note: note.trim() });
      onDone();
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  }

  return (
    <form method="dialog" onSubmit={save} className="pay-form">
      <h2>Mark {o.order_number} paid</h2>
      <p className="adm-muted" style={{ margin: 0 }}>
        {money(o.total)} from {o.contact_name}. This issues the invoice and emails the customer that their order is confirmed.
      </p>
      <fieldset className="adm-fieldset">
        <legend>How was it paid?</legend>
        <div className="adm-chips">
          {methods.map((m) => (
            <button key={m} type="button" className={`adm-chip ${method === m ? "is-on" : ""}`} aria-pressed={method === m} onClick={() => setMethod(m)}>
              {m}
            </button>
          ))}
          <button type="button" className={`adm-chip ${method === "__other" ? "is-on" : ""}`} aria-pressed={method === "__other"} onClick={() => setMethod("__other")}>
            Other
          </button>
        </div>
        {method === "__other" && <input className="adm-input" placeholder="e.g. Cheque" maxLength={40} value={other} onChange={(e) => setOther(e.target.value)} aria-label="Other method" autoFocus />}
      </fieldset>
      <label className="adm-label">
        <span>
          {wantsRef ? "Transaction reference (UTR or UPI ref)" : "Reference"} <span className="adm-muted">· optional</span>
        </span>
        <input className="adm-input" inputMode={wantsRef ? "numeric" : "text"} maxLength={80} placeholder={wantsRef ? "e.g. 412345678901" : "Receipt number, if any"} value={ref} onChange={(e) => setRef(e.target.value)} />
        <span className="adm-muted adm-small">Lets the accountant match this payment to the bank statement.</span>
      </label>
      <div className="pay-row">
        <label className="adm-label">
          Received on
          <input className="adm-input" type="date" value={day} max={isoDay(0)} min={isoDay(-365)} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="adm-label">
          <span>
            Note <span className="adm-muted">· optional</span>
          </span>
          <input className="adm-input" maxLength={500} placeholder="e.g. paid to the shop's UPI" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {err && <p className="adm-err">{err}</p>}
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Back
        </button>
        <button className="adm-btn pri" disabled={busy}>
          {busy ? "Saving" : `Mark paid · ${money(o.total)}`}
        </button>
      </div>
    </form>
  );
}

// quick outcomes for a payment call; "Call back" also opens a follow-up on Home
const OUTCOMES = ["No answer", "Will pay today", "Will pay later", "Call back", "Wrong number", "Wants to cancel"];

export function LogContactForm({ order: o, userId, onDone, onCancel }: { order: Order; userId: string | undefined; onDone: () => void; onCancel: () => void }) {
  const [channel, setChannel] = useState<SupportChannel>("call");
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [follow, setFollow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const body = [outcome, note.trim()].filter(Boolean).join(": ");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!o.profile_id) return setErr("This order has no customer account to log against.");
    if (!userId) return setErr("Sign in again to log this.");
    if (!body) return setErr("Pick what happened, or write a note.");
    setBusy(true);
    try {
      await addCustomerNote(o.profile_id, userId, `Payment for ${o.order_number}: ${body}`, { kind: "contact", channel, order_id: o.id, open: follow });
      onDone();
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  }

  return (
    <form method="dialog" onSubmit={save} className="pay-form">
      <h2>Log a contact · {o.order_number}</h2>
      <p className="adm-muted" style={{ margin: 0 }}>
        {o.contact_name} · {o.contact_phone}. It goes on the order and in the customer&apos;s support history.
      </p>
      <fieldset className="adm-fieldset">
        <legend>How</legend>
        <div className="adm-chips">
          {(
            [
              ["call", "Call"],
              ["whatsapp", "WhatsApp"],
              ["email", "Email"],
            ] as [SupportChannel, string][]
          ).map(([c, l]) => (
            <button key={c} type="button" className={`adm-chip ${channel === c ? "is-on" : ""}`} aria-pressed={channel === c} onClick={() => setChannel(c)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="adm-fieldset">
        <legend>What happened</legend>
        <div className="adm-chips">
          {OUTCOMES.map((x) => (
            <button
              key={x}
              type="button"
              className={`adm-chip ${outcome === x ? "is-on" : ""}`}
              aria-pressed={outcome === x}
              onClick={() => {
                setOutcome(outcome === x ? "" : x);
                if (x === "Call back" || x === "Will pay later") setFollow(outcome !== x);
              }}
            >
              {x}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="adm-label">
        <span>
          Note <span className="adm-muted">· optional</span>
        </span>
        <input className="adm-input" maxLength={300} placeholder={outcome === "Call back" ? "e.g. after 5 pm" : "Anything to remember"} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="adm-check">
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        Needs a follow-up (listed on Home until done)
      </label>
      {err && <p className="adm-err">{err}</p>}
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Back
        </button>
        <button className="adm-btn pri" disabled={busy}>
          {busy ? "Saving" : "Log it"}
        </button>
      </div>
    </form>
  );
}
