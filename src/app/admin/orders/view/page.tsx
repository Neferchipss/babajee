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
  undoRefund,
  type Order,
  type Refund,
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
  const [undoing, setUndoing] = useState<Refund | null>(null);
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
      setUndoing(null);
      await load();
    } catch (e) {
      setErr(errText(e));
      setForm(null);
      setUndoing(null);
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

  const placed = when(o.created_at).toLowerCase();
  const closedAt = (o.order_events ?? []).find((e) => e.status === o.status)?.created_at;
  const primary = actions.filter((a) => a.primary);
  const quiet = actions.filter((a) => !a.primary);
  const phone = o.contact_phone.replace(/\D/g, "");
  const wa = phone.length === 10 ? `91${phone}` : phone.length === 12 && phone.startsWith("91") ? phone : "";
  // status changes already sit on the road; activity keeps everything else
  const activity = (o.order_events ?? []).filter(
    (e) => ["comment", "edited", "refund", "return", "balance", "refund_undone"].includes(e.status) || ((e.status === "cancelled" || e.status === "refunded") && e.note),
  );

  const next =
    o.status === "pending"
      ? `Waiting for ${money(o.total)}. Mark it paid when the money arrives.`
      : o.status === "paid"
        ? `Paid. Pack the ${count} item${count === 1 ? "" : "s"} next.`
        : o.status === "packed"
          ? "Packed. Hand it to the courier, then mark it shipped."
          : o.status === "shipped"
            ? `On its way${ship?.carrier ? ` with ${ship.carrier}` : ""}. Mark it delivered when it arrives.`
            : o.status === "delivered"
              ? `Delivered${ship?.delivered_at ? ` ${when(ship.delivered_at).toLowerCase()}` : ""}. Nothing left to do.`
              : o.status === "cancelled"
                ? `Cancelled${closedAt ? ` ${when(closedAt).toLowerCase()}` : ""}.`
                : `Refunded in full: ${money(refunds.amount)} sent back.`;

  return (
    <div className="ov">
      <Link href="/admin/orders" className="adm-back">
        ← Orders
      </Link>

      <section className={`adm-card ov-hero is-${o.status}`}>
        <div className="ov-top">
          <div className="ov-title">
            <h1>
              {o.order_number}
              <StatusPill status={o.status} />
              {refunds.amount > 0 && o.status !== "refunded" && <span className="adm-pill off">Partly refunded</span>}
              {o.is_test && <span className="adm-pill off">Test</span>}
            </h1>
            <p className="ov-next">{next}</p>
            <p className="adm-muted adm-small ov-meta">
              Placed {placed} · {count} item{count === 1 ? "" : "s"} · {o.contact_name}, {o.address_city}
            </p>
          </div>
          <div className="ov-total">
            <span>Total</span>
            <b>{money(o.total)}</b>
            <small>
              {paid == null
                ? "Not paid yet"
                : refunds.amount > 0
                  ? `${money(paid - refunds.amount)} kept after refunds`
                  : paid === o.total
                    ? "Paid"
                    : `${money(paid)} paid`}
            </small>
          </div>
        </div>

        <Roadmap order={o} />

        {(actions.length > 0 || canEdit || canReturn || canRefund) && (
          <div className="ov-actions">
            {primary.map((a) => (
              <button key={a.to} type="button" className="adm-btn pri ov-go" disabled={busy} onClick={() => (a.to === "shipped" ? setAsking(a) : run(a))}>
                {a.label}
              </button>
            ))}
            <span className="ov-gap" />
            {quiet
              .filter((a) => !a.danger)
              .map((a) => (
                <button key={a.to} type="button" className="adm-btn" disabled={busy} onClick={() => (a.to === "shipped" ? setAsking(a) : run(a))}>
                  {a.label}
                </button>
              ))}
            {canEdit && (
              <button type="button" className="adm-btn" disabled={busy} onClick={() => setForm("edit")}>
                Edit order
              </button>
            )}
            {canReturn && (
              <button type="button" className="adm-btn" disabled={busy} onClick={() => setForm("return")}>
                Return items
              </button>
            )}
            {canRefund && (
              <button type="button" className="adm-btn bad" disabled={busy} onClick={() => setForm("refund")}>
                Refund
              </button>
            )}
            {quiet
              .filter((a) => a.danger)
              .map((a) => (
                <button key={a.to} type="button" className="adm-btn bad" disabled={busy} onClick={() => setAsking(a)}>
                  {a.label}
                </button>
              ))}
          </div>
        )}
      </section>

      {err && <p className="adm-err">{err}</p>}
      {balance !== 0 && (
        <div className={`adm-balance ov-balance ${balance > 0 ? "owe" : "back"}`}>
          <span>
            <b>{balance > 0 ? `${money(balance)} to collect` : `${money(-balance)} to pay back`}</b>
            {balance > 0 ? " · the order was edited after it was paid." : " · the order was edited after it was paid."}
          </span>
          <button type="button" className="adm-btn" disabled={busy} onClick={() => act(() => settleBalance(o.id))}>
            {balance > 0 ? "Mark as collected" : "Mark as paid back"}
          </button>
        </div>
      )}

      <div className="adm-two">
        <div className="adm-stack">
          <section className="adm-card">
            <h2>
              {count} item{count === 1 ? "" : "s"}
            </h2>
            <ul className="ov-items">
              {items.map((i) => {
                const back = refunds.byItem.get(i.id) ?? 0;
                return (
                  <li key={i.id} className={back === i.quantity ? "is-back" : ""}>
                    <span className="ov-qty">{i.quantity}×</span>
                    <span className="ov-name">
                      <strong>{i.product_name}</strong>
                      {i.variant_label && <span className="adm-muted"> · {i.variant_label}</span>}
                      <span className="adm-muted adm-small ov-sub">
                        {money(i.unit_price)} each{i.sku ? ` · SKU ${i.sku}` : ""}
                        {back > 0 && <span className="adm-refunded"> · {back === i.quantity ? "refunded" : `${back} refunded`}</span>}
                      </span>
                    </span>
                    <strong className="ov-line">{money(i.unit_price * i.quantity)}</strong>
                  </li>
                );
              })}
            </ul>
            <div className="adm-kv ov-sum">
              <span>Subtotal</span>
              <span>{money(o.subtotal)}</span>
              <span>Delivery</span>
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
                    {o.status !== "cancelled" && (
                      <>
                        {" · "}
                        <button type="button" className="adm-link" disabled={busy} onClick={() => setUndoing(r)}>
                          Undo
                        </button>
                      </>
                    )}
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
          </section>

          <OrderProfit order={o} />

          <section className="adm-card">
            <h2>Comments and changes</h2>
            <form onSubmit={postComment} className="ov-comment">
              <input className="adm-input" placeholder="Leave a comment for staff (the customer never sees it)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
              <button className="adm-btn" disabled={busy || !comment.trim()}>
                Post
              </button>
            </form>
            {activity.length > 0 ? (
              <ol className="adm-tl">
                {activity.map((e) => (
                  <li key={e.id} className={e.status === "comment" ? "comment" : ""}>
                    <span>{eventText(e.status, e.note)}</span>
                    <time dateTime={e.created_at}>{when(e.created_at)}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="adm-muted adm-small" style={{ margin: "12px 0 0" }}>
                Nothing yet. Edits, refunds and comments show here; status changes are on the road above.
              </p>
            )}
          </section>
        </div>

        <div className="adm-stack">
          <section className="adm-card">
            <h2>Customer</h2>
            <div className="ov-who">
              {o.profile_id ? (
                <Link href={`/admin/customers/view?id=${o.profile_id}`} className="ov-name-link">
                  {o.contact_name}
                </Link>
              ) : (
                <strong>{o.contact_name}</strong>
              )}
              <span className="adm-muted adm-small">{o.contact_email}</span>
            </div>
            <div className="ov-reach">
              <a className="adm-btn" href={`tel:${o.contact_phone.replace(/\s/g, "")}`}>
                Call {o.contact_phone}
              </a>
              {wa && (
                <a className="adm-btn" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              )}
            </div>
            <h3 className="ov-h3">Deliver to</h3>
            <p className="adm-small ov-addr">
              {[o.address_line1, o.address_line2, o.address_landmark && `Near ${o.address_landmark}`, `${o.address_city}, ${o.address_state} ${o.address_pincode}`]
                .filter(Boolean)
                .map((l) => (
                  <span key={String(l)}>{l}</span>
                ))}
            </p>
            <AddressMap lat={o.address_latitude} lng={o.address_longitude} label={`${o.contact_name}, ${o.address_line1}`} />
            {ship && (
              <>
                <h3 className="ov-h3">Courier</h3>
                <p className="adm-small ov-addr">
                  <span>{ship.carrier || "Courier not noted"}</span>
                  {ship.tracking_number && (
                    <span>
                      Tracking <b className="ov-track">{ship.tracking_number}</b>
                    </span>
                  )}
                </p>
              </>
            )}
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
      <Dialog open={undoing !== null} onClose={() => setUndoing(null)}>
        {undoing && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => undoRefund(undoing.id));
            }}
          >
            <h2>Undo this {money(undoing.amount)} refund?</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              {(undoing.order_refund_items?.length ?? 0) > 0
                ? `It covered ${undoing.order_refund_items!
                    .map((ri) => {
                      const it = items.find((i) => i.id === ri.order_item_id);
                      return `${it?.product_name ?? "an item"}${ri.quantity > 1 ? ` ×${ri.quantity}` : ""}`;
                    })
                    .join(", ")}.`
                : "It was an amount on its own, with no items."}{" "}
              {undoing.restocked && "Those items come back off the shelf. "}
              {o.status === "refunded" && "The order reopens where it was before. "}
              Then you can record the right refund. The activity keeps a note of this.
            </p>
            <p className="adm-muted adm-small" style={{ margin: 0 }}>
              If the money really went out, keep the refund. Undo is for a refund recorded by mistake.
            </p>
            <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="adm-btn" onClick={() => setUndoing(null)}>
                Keep it
              </button>
              <button className="adm-btn bad" disabled={busy}>
                {busy ? "Undoing" : "Undo refund"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog open={form !== null} onClose={() => setForm(null)} wide={form === "edit"}>
        {(form === "refund" || form === "return") && (
          <RefundForm
            order={o}
            mode={form}
            busy={busy}
            onCancel={() => setForm(null)}
            onSubmit={(r: RefundInput) => act(() => refundOrder(o.id, r))}
            onEdit={canEdit ? () => setForm("edit") : undefined}
          />
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
