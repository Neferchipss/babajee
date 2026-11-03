"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import AddressMap from "@/components/admin/AddressMap";
import { EditForm, RefundForm, type EditInput, type RefundInput } from "@/components/admin/OrderForms";
import { Dialog, money, StatusPill, when } from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import { actionsFor, eventText, STEPS, type OrderAction, type OrderStatus } from "@/lib/order-status";
import { unitProfit } from "@/lib/gst";
import {
  addOrderComment,
  editOrder,
  errText,
  getCosts,
  getOrder,
  getSettings,
  refundOrder,
  refundsOf,
  setOrderNotes,
  settleBalance,
  soldCosts,
  updateOrder,
  type Order,
} from "@/lib/orders-db";

// One order: what to do next at the top, then the items, the money, the
// timeline (with staff comments), and the customer on the side.
export default function OrderViewPage() {
  return (
    <Suspense>
      <OrderView />
    </Suspense>
  );
}

function OrderView() {
  const id = useSearchParams().get("id") ?? "";
  const { user } = useAuth();
  const [o, setO] = useState<Order | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<OrderAction | null>(null);
  const [form, setForm] = useState<"refund" | "return" | "edit" | null>(null);
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(
    () =>
      getOrder(id)
        .then((r) => {
          setO(r);
          setNotes(r?.notes ?? "");
        })
        .catch((e) => setErr(errText(e))),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function run(a: OrderAction, opts: Parameters<typeof updateOrder>[2] = {}) {
    if (!o) return;
    setBusy(true);
    setErr("");
    try {
      await updateOrder(o.id, a.to, opts);
      setAsking(null);
      await load();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  // refund / return / edit / settle: same busy + reload as a status change
  async function act(f: () => Promise<void>) {
    setBusy(true);
    setErr("");
    try {
      await f();
      setForm(null);
      await load();
    } catch (e) {
      setErr(errText(e));
      setForm(null);
    }
    setBusy(false);
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!o || !user || !comment.trim()) return;
    setBusy(true);
    try {
      await addOrderComment(o.id, user.id, comment.trim());
      setComment("");
      await load();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  if (o === undefined) return <p className="adm-muted">{err || "Loading the order."}</p>;
  if (o === null)
    return (
      <div>
        <Link href="/admin/orders" className="adm-back">
          ← Orders
        </Link>
        <p className="adm-muted">This order doesn&apos;t exist, or was removed.</p>
      </div>
    );

  const actions = actionsFor(o.status);
  const items = o.order_items ?? [];
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const ship = o.shipments?.[0];
  const refunds = refundsOf(o);
  const paid = o.paid_total;
  const left = (paid ?? 0) - refunds.amount;
  const canEdit = ["pending", "paid", "packed"].includes(o.status) && refunds.amount === 0;
  const canRefund = ["paid", "packed", "shipped", "delivered"].includes(o.status) && left > 0;
  const canReturn = ["shipped", "delivered"].includes(o.status) && left > 0 && items.some((i) => i.quantity > (refunds.byItem.get(i.id) ?? 0));
  const balance = paid == null || o.status === "cancelled" || o.status === "refunded" ? 0 : Math.round((o.total - paid) * 100) / 100;

  return (
    <div>
      <Link href="/admin/orders" className="adm-back">
        ← Orders
      </Link>
      <header className="adm-head">
        <div className="grow">
          <h1 style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            {o.order_number} <StatusPill status={o.status} />
            {refunds.amount > 0 && o.status !== "refunded" && <span className="adm-pill off">Partly refunded</span>}
          </h1>
          <p className="adm-sub">
            Placed {when(o.created_at).toLowerCase()} · {count} item{count === 1 ? "" : "s"} · {money(o.total)}
            {o.is_test && " · test order"}
          </p>
        </div>
        <div className="adm-actions">
          {actions.map((a) => (
            <button
              key={a.to}
              type="button"
              className={`adm-btn ${a.primary ? "pri" : ""} ${a.danger ? "bad" : ""}`}
              disabled={busy}
              onClick={() => (a.to === "shipped" || a.to === "cancelled" ? setAsking(a) : run(a))}
            >
              {a.label}
            </button>
          ))}
          {canEdit && (
            <button type="button" className="adm-btn" disabled={busy} onClick={() => setForm("edit")}>
              Edit
            </button>
          )}
          {canReturn && (
            <button type="button" className="adm-btn" disabled={busy} onClick={() => setForm("return")}>
              Return
            </button>
          )}
          {canRefund && (
            <button type="button" className="adm-btn bad" disabled={busy} onClick={() => setForm("refund")}>
              Refund
            </button>
          )}
        </div>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <Roadmap order={o} />

      <div className="adm-two">
        <div className="adm-stack">
          <section className="adm-card">
            <h2>Items</h2>
            <table className="adm-table">
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.product_name}</strong>
                      {i.variant_label && <span className="adm-muted"> · {i.variant_label}</span>}
                      {i.sku && <div className="adm-muted adm-small">SKU {i.sku}</div>}
                      {(refunds.byItem.get(i.id) ?? 0) > 0 && (
                        <div className="adm-small adm-refunded">
                          {refunds.byItem.get(i.id) === i.quantity ? "Refunded" : `${refunds.byItem.get(i.id)} of ${i.quantity} refunded`}
                        </div>
                      )}
                    </td>
                    <td className="r adm-muted">
                      {money(i.unit_price)} × {i.quantity}
                    </td>
                    <td className="r">
                      <strong>{money(i.unit_price * i.quantity)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="adm-card">
            <h2>Payment</h2>
            <div className="adm-kv">
              <span>
                Subtotal · {count} item{count === 1 ? "" : "s"}
              </span>
              <span>{money(o.subtotal)}</span>
              <span>Shipping</span>
              <span>{o.shipping ? money(o.shipping) : "Free"}</span>
              {o.tax > 0 && (
                <>
                  <span>{o.gst_inclusive ? `Includes GST (${o.gst_rate}%)` : `GST (${o.gst_rate}%)`}</span>
                  <span>{money(o.tax)}</span>
                </>
              )}
              <span className="tot">Total</span>
              <span className="tot">{money(o.total)}</span>
              <span className="adm-muted">Paid</span>
              <span className="adm-muted">{paid == null ? "Not yet" : money(paid)}</span>
              {(o.order_refunds ?? []).map((r) => (
                <Fragment key={r.id}>
                  <span className="adm-muted">
                    {r.returned ? "Returned" : "Refunded"} {when(r.created_at).toLowerCase()}
                    {r.reason && <span className="adm-small"> · {r.reason}</span>}
                  </span>
                  <span className="adm-refunded">−{money(r.amount)}</span>
                </Fragment>
              ))}
              {refunds.amount > 0 && (
                <>
                  <span>
                    <strong>Kept</strong>
                  </span>
                  <span>
                    <strong>{money((paid ?? 0) - refunds.amount)}</strong>
                  </span>
                </>
              )}
            </div>
            {balance !== 0 && (
              <div className={`adm-balance ${balance > 0 ? "owe" : "back"}`}>
                <span>{balance > 0 ? `${money(balance)} more to collect, since the order was edited.` : `${money(-balance)} to pay back, since the order was edited.`}</span>
                <button type="button" className="adm-btn" disabled={busy} onClick={() => act(() => settleBalance(o.id))}>
                  {balance > 0 ? "Mark as collected" : "Mark as paid back"}
                </button>
              </div>
            )}
          </section>

          <OrderProfit order={o} />

          {ship && (
            <section className="adm-card">
              <h2>Shipping</h2>
              <div className="adm-kv">
                <span>Courier</span>
                <span>{ship.carrier || "–"}</span>
                <span>Tracking number</span>
                <span>{ship.tracking_number || "–"}</span>
                <span>Shipped</span>
                <span>{ship.shipped_at ? when(ship.shipped_at) : "–"}</span>
                <span>Delivered</span>
                <span>{ship.delivered_at ? when(ship.delivered_at) : "Not yet"}</span>
              </div>
            </section>
          )}

          <section className="adm-card">
            <h2>Timeline</h2>
            <form onSubmit={postComment} style={{ display: "flex", gap: 8 }}>
              <input className="adm-input" placeholder="Leave a comment for staff (the customer never sees it)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
              <button className="adm-btn" disabled={busy || !comment.trim()}>
                Post
              </button>
            </form>
            <ol className="adm-tl">
              {(o.order_events ?? []).map((e) => (
                <li key={e.id} className={e.status === "comment" ? "comment" : ""}>
                  <span>{eventText(e.status, e.note)}</span>
                  <time dateTime={e.created_at}>{when(e.created_at)}</time>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="adm-stack">
          <section className="adm-card">
            <h2>Customer</h2>
            {o.profile_id ? (
              <Link href={`/admin/customers/view?id=${o.profile_id}`} style={{ fontWeight: 700 }}>
                {o.contact_name}
              </Link>
            ) : (
              <strong>{o.contact_name}</strong>
            )}
            <p className="adm-small" style={{ margin: "10px 0 0" }}>
              <a href={`tel:${o.contact_phone.replace(/\s/g, "")}`}>{o.contact_phone}</a>
              <br />
              <span className="adm-muted">{o.contact_email}</span>
            </p>
            <h2 style={{ margin: "16px 0 6px" }}>Deliver to</h2>
            <p className="adm-small adm-muted" style={{ margin: 0 }}>
              {[o.address_line1, o.address_line2, o.address_landmark && `Near ${o.address_landmark}`, `${o.address_city}, ${o.address_state} ${o.address_pincode}`]
                .filter(Boolean)
                .map((l) => (
                  <span key={String(l)} style={{ display: "block" }}>
                    {l}
                  </span>
                ))}
            </p>
            <AddressMap lat={o.address_latitude} lng={o.address_longitude} label={`${o.contact_name}, ${o.address_line1}`} />
          </section>

          <section className="adm-card">
            <h2>Notes</h2>
            <textarea className="adm-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Customer's note, or yours" aria-label="Order notes" />
            {notes !== o.notes && (
              <button
                type="button"
                className="adm-btn"
                style={{ marginTop: 8 }}
                disabled={busy}
                onClick={() =>
                  setOrderNotes(o.id, notes)
                    .then(load)
                    .catch((e) => setErr(errText(e)))
                }
              >
                Save notes
              </button>
            )}
          </section>
        </div>
      </div>

      <Dialog open={asking !== null} onClose={() => setAsking(null)}>
        {asking && <Confirm action={asking} order={o} busy={busy} onCancel={() => setAsking(null)} onConfirm={(opts) => run(asking, opts)} />}
      </Dialog>
      <Dialog open={form !== null} onClose={() => setForm(null)} wide={form === "edit"}>
        {(form === "refund" || form === "return") && (
          <RefundForm order={o} mode={form} busy={busy} onCancel={() => setForm(null)} onSubmit={(r: RefundInput) => act(() => refundOrder(o.id, r))} />
        )}
        {form === "edit" && <EditForm order={o} busy={busy} onCancel={() => setForm(null)} onSubmit={(e: EditInput) => act(() => editOrder(o.id, e))} />}
      </Dialog>
    </div>
  );
}

function Confirm({
  action,
  order,
  busy,
  onCancel,
  onConfirm,
}: {
  action: OrderAction;
  order: Order;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (opts: Parameters<typeof updateOrder>[2]) => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm({ carrier, tracking, note });
      }}
    >
      {action.to === "shipped" && (
        <>
          <h2>Ship {order.order_number}</h2>
          <label className="adm-label">
            Courier
            <input className="adm-input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Delhivery, DTDC, India Post…" autoFocus />
          </label>
          <label className="adm-label">
            Tracking number
            <input className="adm-input" value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </label>
        </>
      )}
      {action.to === "cancelled" && (
        <>
          <h2>Cancel {order.order_number}?</h2>
          <p className="adm-muted" style={{ margin: 0 }}>
            Tracked stock goes back on the shelf. This can&apos;t be undone.
          </p>
          <label className="adm-label">
            Reason (for the timeline)
            <input className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Customer asked, didn't pay…" />
          </label>
        </>
      )}
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Back
        </button>
        <button className={`adm-btn ${action.danger ? "bad" : "pri"}`} disabled={busy}>
          {busy ? "Saving" : action.label}
        </button>
      </div>
    </form>
  );
}

// Where the order has got to, as a road: placed, paid, packed, shipped,
// delivered, each with when it happened. A step the shop jumped past is shown as
// skipped; a cancelled or refunded order ends the road where it stopped.
const STEP_LABEL: Record<string, string> = { pending: "Placed", paid: "Paid", packed: "Packed", shipped: "Shipped", delivered: "Delivered" };
function Roadmap({ order: o }: { order: Order }) {
  const events = (o.order_events ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const at = (s: string) => events.find((e) => e.status === s)?.created_at;
  const closed = o.status === "cancelled" || o.status === "refunded";
  // the furthest step reached: for a closed order, the last step before it closed
  const reached = closed
    ? Math.max(0, ...STEPS.map((s, i) => (at(s) ? i : -1)))
    : STEPS.indexOf(o.status as OrderStatus);
  const ship = o.shipments?.[0];
  const steps = STEPS.map((s, i) => {
    const when = s === "pending" ? o.created_at : at(s);
    const state = i < reached ? (when ? "done" : "skipped") : i === reached ? (closed ? "done" : "now") : closed ? "off" : "next";
    let note = when ? when : "";
    if (s === "shipped" && ship?.carrier) note = note ? `${note}|${ship.carrier}${ship.tracking_number ? ` · ${ship.tracking_number}` : ""}` : note;
    return { s, label: STEP_LABEL[s], state, when, extra: note.includes("|") ? note.split("|")[1] : "" };
  });
  return (
    <ol className="adm-road" aria-label="Order progress">
      {steps.map((st) => (
        <li key={st.s} className={`is-${st.state}`} aria-current={st.state === "now" ? "step" : undefined}>
          <i aria-hidden="true">{st.state === "done" ? "✓" : st.state === "skipped" ? "–" : ""}</i>
          <span>
            <b>{st.label}</b>
            <small>{st.when ? when(st.when) : st.state === "skipped" ? "Skipped" : st.state === "now" ? "Now" : st.state === "off" ? "" : "Not yet"}</small>
            {st.extra && <small>{st.extra}</small>}
          </span>
        </li>
      ))}
      {closed && (
        <li className="is-stop" aria-current="step">
          <i aria-hidden="true">×</i>
          <span>
            <b>{o.status === "cancelled" ? "Cancelled" : "Refunded"}</b>
            <small>{at(o.status) ? when(at(o.status)!) : ""}</small>
          </span>
        </li>
      )}
    </ol>
  );
}

// What the shop made on this order: each kept unit's sale with GST taken out,
// less what every unit that left the shelf for good cost (as it was when sold;
// today's cost if it was entered later). Refunds beyond the items they name
// (goodwill) come off too. Delivery is left out: the courier's charge isn't
// recorded. Same rules as Analytics (supabase/migrations/0017).
function OrderProfit({ order: o }: { order: Order }) {
  const items = o.order_items ?? [];
  const [data, setData] = useState<{ sold: Map<string, number>; now: Map<string, number>; credit: boolean } | null>(null);

  useEffect(() => {
    const its = o.order_items ?? [];
    Promise.all([soldCosts(its.map((i) => i.id)), getCosts(its.flatMap((i) => (i.variant_id ? [i.variant_id] : []))), getSettings()])
      .then(([sold, now, s]) => setData({ sold, now, credit: s.gst_input_credit }))
      .catch(() => setData(null));
  }, [o.order_items]);

  if (!data) return null;
  const g = { rate: o.gst_rate, inclusive: o.gst_inclusive, credit: data.credit };
  const rs = o.order_refunds ?? [];
  const back = new Map<string, number>();
  const shelved = new Map<string, number>();
  let extra = 0;
  for (const r of rs) {
    let named = 0;
    for (const ri of r.order_refund_items ?? []) {
      back.set(ri.order_item_id, (back.get(ri.order_item_id) ?? 0) + ri.quantity);
      if (r.restocked) shelved.set(ri.order_item_id, (shelved.get(ri.order_item_id) ?? 0) + ri.quantity);
      named += ri.quantity * (items.find((i) => i.id === ri.order_item_id)?.unit_price ?? 0);
    }
    extra += r.subtotal - named;
  }
  if (o.gst_inclusive) extra = (extra * 100) / (100 + o.gst_rate);
  let net = 0;
  let cost = 0;
  let missing = 0;
  let later = 0;
  for (const i of items) {
    const c = data.sold.get(i.id) ?? (i.variant_id ? data.now.get(i.variant_id) : undefined);
    if (c === undefined) {
      missing++;
      continue;
    }
    if (!data.sold.has(i.id)) later++;
    const u = unitProfit(i.unit_price, c, g);
    net += u.net * (i.quantity - (back.get(i.id) ?? 0));
    cost += u.cost * (i.quantity - (shelved.get(i.id) ?? 0));
  }
  if (missing === 0) net -= extra;
  const profit = net - cost;
  const gone = o.status === "cancelled";

  return (
    <section className="adm-card">
      <h2>Profit</h2>
      {missing === items.length ? (
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          No cost price entered for {items.length === 1 ? "this item" : "these items"}. Add it on the product to see the profit.
        </p>
      ) : (
        <>
          <div className="adm-kv">
            <span>Sales without GST</span>
            <span>{money(Math.round(net * 100) / 100)}</span>
            <span>Cost{data.credit ? " without GST" : ""}</span>
            <span>−{money(Math.round(cost * 100) / 100)}</span>
            <span className="tot">Profit</span>
            <span className={`tot ${profit < 0 ? "adm-profit-neg" : "adm-profit-pos"}`}>
              {money(Math.round(profit * 100) / 100)}
              {net > 0 && <small className="adm-muted"> · {((profit / net) * 100).toFixed(1)}%</small>}
            </span>
          </div>
          <p className="adm-muted adm-small" style={{ margin: "12px 0 0" }}>
            {gone && "This order was cancelled, so it counts for nothing in Analytics. "}
            {rs.length > 0 && "Refunded items are taken off; returned items that went back in stock cost nothing. "}
            {missing > 0 && `${missing} item${missing === 1 ? " has" : "s have"} no cost price and ${missing === 1 ? "is" : "are"} left out. `}
            {later > 0 && `${later === 1 ? "One item uses" : `${later} items use`} today's cost, entered after the sale. `}
            Delivery charges are not counted.
          </p>
        </>
      )}
    </section>
  );
}
