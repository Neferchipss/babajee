"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { addCustomerNote, errText, requestsFor, setNoteStatus, type CustomerNote, type Order, type OrderRequest, type SupportChannel } from "@/lib/orders-db";

// Everything between the shop and one customer, newest first: contacts the
// staff logged (a call, a WhatsApp, an email), private notes, the customer's
// cancellation and return requests with the shop's replies, and failed
// deliveries. A contact can need a follow-up; open ones count on Home.
const CHANNELS: [SupportChannel, string][] = [
  ["whatsapp", "WhatsApp"],
  ["call", "Call"],
  ["email", "Email"],
  ["instagram", "Instagram"],
  ["in_person", "In person"],
  ["other", "Other"],
];
const channelName = (c: SupportChannel) => CHANNELS.find(([k]) => k === c)?.[1] ?? "";

type Item = { key: string; at: string; head: string; body?: string; order?: Order; note?: CustomerNote; tone?: "open" | "bad" };

export default function SupportHistory({ customerId, userId, notes, orders, onChange }: { customerId: string; userId: string | undefined; notes: CustomerNote[]; orders: Order[]; onChange: () => Promise<unknown> }) {
  const [kind, setKind] = useState<"contact" | "note">("contact");
  const [channel, setChannel] = useState<SupportChannel>("whatsapp");
  const [orderId, setOrderId] = useState("");
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<(OrderRequest & { order_id: string })[]>([]);

  const orderIds = orders.map((o) => o.id).join(",");
  useEffect(() => {
    let live = true;
    requestsFor(orderIds ? orderIds.split(",") : []).then((r) => live && setRequests(r), () => {});
    return () => {
      live = false;
    };
  }, [orderIds]);

  const items = useMemo<Item[]>(() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const out: Item[] = notes.map((n) => ({
      key: `n-${n.id}`,
      at: n.created_at,
      head: n.kind === "contact" ? `${channelName(n.channel) || "Contact"}${n.status === "open" ? " · needs a follow-up" : n.status === "resolved" ? " · done" : ""}` : "Note",
      body: n.body,
      order: n.order_id ? byId.get(n.order_id) : undefined,
      note: n,
      tone: n.status === "open" ? "open" : undefined,
    }));
    for (const r of requests) {
      const o = byId.get(r.order_id);
      out.push({
        key: `r-${r.id}`,
        at: r.created_at,
        head: `Asked to ${r.kind === "cancel" ? "cancel" : "return items"} · ${r.status === "open" ? "waiting for you" : r.status}`,
        body: [r.reason && `“${r.reason}”`, r.reply && `Your reply: ${r.reply}`].filter(Boolean).join("\n") || undefined,
        order: o,
        tone: r.status === "open" ? "open" : undefined,
      });
    }
    for (const o of orders) {
      if ((o.delivery_attempts ?? 0) > 0)
        out.push({
          key: `f-${o.id}`,
          at: o.delivery_failed_at ?? o.created_at,
          head: `Delivery failed${(o.delivery_attempts ?? 0) > 1 ? ` ${o.delivery_attempts} times` : ""}`,
          body: o.delivery_failed_reason || undefined,
          order: o,
          tone: "bad",
        });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [notes, requests, orders]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !body.trim()) return;
    setBusy(true);
    try {
      await addCustomerNote(customerId, userId, body.trim(), { kind, channel: kind === "contact" ? channel : "", order_id: orderId || null, open: kind === "contact" && open });
      setBody("");
      setOpen(false);
      setOrderId("");
      await onChange();
      toast(kind === "contact" ? (open ? "Logged, waiting on a follow-up" : "Contact logged") : "Note added");
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  async function flip(n: CustomerNote) {
    try {
      await setNoteStatus(n.id, n.status === "open" ? "resolved" : "open");
      await onChange();
      toast(n.status === "open" ? "Marked as done" : "Opened again");
    } catch (x) {
      toastError(errText(x));
    }
  }

  const waiting = notes.filter((n) => n.status === "open").length;

  return (
    <section className="adm-card">
      <h2>
        Support history
        {waiting > 0 && <span className="adm-pill warn" style={{ marginLeft: 8 }}>{waiting} to follow up</span>}
      </h2>
      <form className="sup-form" onSubmit={add}>
        <div className="adm-chips" role="radiogroup" aria-label="What to add">
          {(
            [
              ["contact", "Log a contact"],
              ["note", "Private note"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`adm-chip ${kind === k ? "is-on" : ""}`} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        {kind === "contact" && (
          <div className="sup-row">
            <select className="adm-input" value={channel} onChange={(e) => setChannel(e.target.value as SupportChannel)} aria-label="How">
              {CHANNELS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select className="adm-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="About an order">
              <option value="">Not about an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number}
                </option>
              ))}
            </select>
          </div>
        )}
        <textarea className="adm-input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === "contact" ? "What was it about, and what did you agree?" : "Private note about this customer"} aria-label={kind === "contact" ? "Summary" : "Note"} />
        <div className="sup-row">
          {kind === "contact" && (
            <label className="sup-check">
              <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
              Needs a follow-up
            </label>
          )}
          <button className="adm-btn pri" disabled={busy || !body.trim()} style={{ marginLeft: "auto" }}>
            {kind === "contact" ? "Log it" : "Add note"}
          </button>
        </div>
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          Only staff see this.
        </p>
      </form>

      {!items.length ? (
        <p className="adm-muted adm-small">Nothing yet.</p>
      ) : (
        <ol className="sup-list">
          {items.map((i) => (
            <li key={i.key} className={i.tone ? `is-${i.tone}` : ""}>
              <div className="sup-head">
                <b>{i.head}</b>
                {i.order && (
                  <Link href={`/admin/orders/view?id=${i.order.id}`} className="adm-small">
                    {i.order.order_number}
                  </Link>
                )}
                <time className="adm-muted adm-small" dateTime={i.at}>
                  {when(i.at)}
                </time>
              </div>
              {i.body && <p className="sup-body">{i.body}</p>}
              {i.note?.status && (
                <button type="button" className="adm-link adm-small" onClick={() => flip(i.note!)}>
                  {i.note.status === "open" ? "Mark as done" : "Open again"}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
