"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import AddressMap from "@/components/admin/AddressMap";
import { EditForm, RefundForm, type EditInput, type RefundInput } from "@/components/admin/OrderForms";
import { toast, toastError } from "@/components/admin/Toaster";
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
  resolveRequest,
  setOrderNotes,
  setStep,
  settleBalance,
  soldCosts,
  updateOrder,
  undoRefund,
  type Order,
  type OrderRequest,
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
  const [stepping, setStepping] = useState<OrderStatus | null>(null);
  // a customer request being answered: accepting opens the refund form filled in
  const [answering, setAnswering] = useState<OrderRequest | null>(null);
  const [declining, setDeclining] = useState<OrderRequest | null>(null);
  const [reply, setReply] = useState("");
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
      toast(`${o.order_number} ${a.to === "cancelled" ? "cancelled" : `marked as ${STEP_DO[a.to] ?? a.to}`}`);
    } catch (e) {
      setErr(errText(e));
      toastError(e);
    }
    setBusy(false);
  }

  // refund / return / edit / settle: same busy + reload as a status change
  async function act(f: () => Promise<void>, done?: string) {
    setBusy(true);
    setErr("");
    try {
      await f();
      if (done) toast(done);
      setForm(null);
      setUndoing(null);
      setStepping(null);
      setAnswering(null);
      setDeclining(null);
      await load();
    } catch (e) {
      setErr(errText(e));
      toastError(e);
      setForm(null);
      setUndoing(null);
      setStepping(null);
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
      toast("Comment posted");
    } catch (e) {
      setErr(errText(e));
      toastError(e);
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
  const openReq = (o.order_requests ?? []).find((r) => r.status === "open");
  const canEdit = ["pending", "paid", "packed"].includes(o.status) && refunds.amount === 0;
  const canRefund = ["paid", "packed", "shipped", "delivered"].includes(o.status) && left > 0;
  const canReturn = ["shipped", "delivered"].includes(o.status) && left > 0 && items.some((i) => i.quantity > (refunds.byItem.get(i.id) ?? 0));
  const balance = paid == null || o.status === "cancelled" || o.status === "refunded" ? 0 : Math.round((o.total - paid) * 100) / 100;

  const placed = when(o.created_at).toLowerCase();
  const closedAt = (o.order_events ?? []).find((e) => e.status === o.status)?.created_at;
  const cancel = actions.find((a) => a.to === "cancelled");
  // a click on the road: forward steps that need nothing go straight
  // through; shipping asks for the courier; going back asks first
  function pickStep(to: OrderStatus) {
    if (!o || to === o.status) return;
    const forward = STEPS.indexOf(to) > STEPS.indexOf(o.status);
    if (!forward || to === "shipped" || (to === "delivered" && !ship)) setStepping(to);
    else void act(() => setStep(o.id, to), `${o.order_number} marked as ${STEP_DO[to]}`);
  }
  const phone = o.contact_phone.replace(/\D/g, "");
  const wa = phone.length === 10 ? `91${phone}` : phone.length === 12 && phone.startsWith("91") ? phone : "";
  // status changes already sit on the road; activity keeps everything else
  const activity = (o.order_events ?? []).filter(
    (e) => ["comment", "edited", "refund", "return", "balance", "refund_undone", "request"].includes(e.status) || ((e.status === "cancelled" || e.status === "refunded") && e.note),
  );

  const next =
    o.status === "pending"
      ? `Waiting for ${money(o.total)}. Tap Paid below when the money arrives.`
      : o.status === "paid"
        ? `Paid. Pack the ${count} item${count === 1 ? "" : "s"} next.`
        : o.status === "packed"
          ? "Packed. Tap Shipped once it's with the courier."
          : o.status === "shipped"
            ? `On its way${ship?.carrier ? ` with ${ship.carrier}` : ""}. Tap Delivered when it arrives.`
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

        <Roadmap order={o} busy={busy} onStep={pickStep} />

        {(cancel || canEdit || canReturn || canRefund) && (
          <div className="ov-actions">
            {STEPS.includes(o.status) && <span className="adm-muted adm-small">Tap a step on the road to move the order, forward or back.</span>}
            <span className="ov-gap" />
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
            {cancel && (
              <button type="button" className="adm-btn bad" disabled={busy} onClick={() => setAsking(cancel)}>
                {cancel.label}
              </button>
            )}
          </div>
        )}
      </section>

      {err && <p className="adm-err">{err}</p>}
      {openReq && (
        <div className="ov-request">
          <div>
            <b>{openReq.kind === "cancel" ? "The customer asks to cancel this order" : "The customer asks to return items"}</b>
            <span>
              {openReq.kind === "return" &&
                openReq.items
                  .map((x) => {
                    const it = items.find((i) => i.id === x.item);
                    return `${it?.product_name ?? "An item"}${x.qty > 1 ? ` ×${x.qty}` : ""}`;
                  })
                  .join(", ") + " · "}
              {openReq.reason ? `“${openReq.reason}”` : "No reason given"} · {when(openReq.created_at)}
            </span>
          </div>
          <div className="ov-request-do">
            <button
              type="button"
              className="adm-btn pri"
              disabled={busy || !canRefund}
              title={canRefund ? undefined : "Nothing left to refund on this order"}
              onClick={() => {
                setAnswering(openReq);
                setForm(openReq.kind === "cancel" ? "refund" : "return");
              }}
            >
              {openReq.kind === "cancel" ? "Accept and refund everything" : "Accept and refund"}
            </button>
            <button type="button" className="adm-btn" disabled={busy} onClick={() => (setReply(""), setDeclining(openReq))}>
              Decline
            </button>
          </div>
        </div>
      )}
      {balance !== 0 && (
        <div className={`adm-balance ov-balance ${balance > 0 ? "owe" : "back"}`}>
          <span>
            <b>{balance > 0 ? `${money(balance)} to collect` : `${money(-balance)} to pay back`}</b>
            {balance > 0 ? " · the order was edited after it was paid." : " · the order was edited after it was paid."}
          </span>
          <button type="button" className="adm-btn" disabled={busy} onClick={() => act(() => settleBalance(o.id), balance > 0 ? `${money(balance)} marked as collected` : `${money(-balance)} marked as paid back`)}>
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
                    .then(() => toast("Notes saved"))
                    .catch((e) => (setErr(errText(e)), toastError(e)))
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
      <Dialog open={stepping !== null} onClose={() => setStepping(null)}>
        {stepping && (
          <StepForm
            order={o}
            to={stepping}
            busy={busy}
            onCancel={() => setStepping(null)}
            onConfirm={(opts) =>
              act(
                () => setStep(o.id, stepping, opts),
                STEPS.indexOf(stepping) < STEPS.indexOf(o.status) ? `${o.order_number} moved back to ${STEP_LABEL[stepping].toLowerCase()}` : `${o.order_number} marked as ${STEP_DO[stepping]}`,
              )
            }
          />
        )}
      </Dialog>
      <Dialog open={undoing !== null} onClose={() => setUndoing(null)}>
        {undoing && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => undoRefund(undoing.id), `Refund of ${money(undoing.amount)} undone`);
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
      <Dialog open={declining !== null} onClose={() => setDeclining(null)}>
        {declining && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              if (reply.trim()) void act(() => resolveRequest(declining.id, false, reply.trim()), `${declining.kind === "cancel" ? "Cancellation" : "Return"} request declined`);
            }}
          >
            <h2>Decline the {declining.kind === "cancel" ? "cancellation" : "return"}?</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              The customer sees your reply on their order page, so say what happens next.
            </p>
            <label className="adm-label">
              Reply to the customer
              <textarea
                id="ov-decline-reply"
                className="adm-input"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={declining.kind === "cancel" ? "It's already with the courier. You can return it once it arrives." : "Returns need the item unopened. Get in touch and we'll sort it out."}
                autoFocus
              />
            </label>
            <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="adm-btn" onClick={() => setDeclining(null)}>
                Back
              </button>
              <button className="adm-btn bad" disabled={busy || !reply.trim()}>
                {busy ? "Saving" : "Decline"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog open={form !== null} onClose={() => (setForm(null), setAnswering(null))} wide={form === "edit"}>
        {(form === "refund" || form === "return") && (
          <RefundForm
            order={o}
            mode={form}
            busy={busy}
            onCancel={() => (setForm(null), setAnswering(null))}
            onSubmit={(r: RefundInput) =>
              act(
                async () => {
                  await refundOrder(o.id, r);
                  if (answering) await resolveRequest(answering.id, true, "");
                },
                answering
                  ? `${answering.kind === "cancel" ? "Cancellation" : "Return"} approved · ${money(r.amount)} refunded`
                  : `${r.returned ? "Return recorded" : "Refunded"} · ${money(r.amount)} on ${o.order_number}`,
              )
            }
            onEdit={canEdit && !answering ? () => setForm("edit") : undefined}
            preset={
              answering
                ? answering.kind === "cancel"
                  ? { everything: true, restock: true, note: `Cancelled at the customer's request${answering.reason ? `: ${answering.reason}` : ""}` }
                  : { qty: Object.fromEntries(answering.items.map((x) => [x.item, x.qty])), restock: true, note: answering.reason }
                : undefined
            }
          />
        )}
        {form === "edit" && <EditForm order={o} busy={busy} onCancel={() => setForm(null)} onSubmit={(e: EditInput) => act(() => editOrder(o.id, e), `${o.order_number} updated`)} />}
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
// delivered, each with when it happened. Every step is a button: tap one
// ahead to move the order on, one behind to take it back. A step the shop
// jumped past shows as skipped; a cancelled or refunded order ends the road
// where it stopped and can no longer be moved.
const STEP_LABEL: Record<string, string> = { pending: "Placed", paid: "Paid", packed: "Packed", shipped: "Shipped", delivered: "Delivered" };
const STEP_DO: Record<string, string> = { pending: "unpaid", paid: "paid", packed: "packed", shipped: "shipped", delivered: "delivered" };
function Roadmap({ order: o, busy, onStep }: { order: Order; busy: boolean; onStep: (s: OrderStatus) => void }) {
  const events = (o.order_events ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  // the latest time the order arrived at a step (it may have been moved back and on again)
  const at = (s: string) => events.filter((e) => e.status === s).at(-1)?.created_at;
  const closed = o.status === "cancelled" || o.status === "refunded";
  // the furthest step reached: for a closed order, the last step before it closed
  const reached = closed
    ? Math.max(0, ...STEPS.map((s, i) => (at(s) ? i : -1)))
    : STEPS.indexOf(o.status as OrderStatus);
  const ship = o.shipments?.[0];
  const live = !closed && !busy;
  return (
    <ol className={`adm-road ${closed ? "" : "is-live"}`} aria-label="Order progress">
      {STEPS.map((s, i) => {
        const t = i <= reached ? (s === "pending" ? o.created_at : at(s)) : undefined;
        const state = i < reached ? (t ? "done" : "skipped") : i === reached ? (closed ? "done" : "now") : closed ? "off" : i === reached + 1 ? "up" : "next";
        const extra = s === "shipped" && i <= reached && ship?.carrier ? `${ship.carrier}${ship.tracking_number ? ` · ${ship.tracking_number}` : ""}` : "";
        const sub = t ? when(t) : state === "skipped" ? "Skipped" : state === "up" ? `Mark ${STEP_DO[s]}` : state === "off" ? "" : "Not yet";
        const body = (
          <>
            <i aria-hidden="true">{state === "done" ? "✓" : state === "skipped" ? "–" : ""}</i>
            <span>
              <b>{STEP_LABEL[s]}</b>
              <small>{sub}</small>
              {extra && <small>{extra}</small>}
            </span>
          </>
        );
        return (
          <li key={s} className={`is-${state}`} aria-current={state === "now" ? "step" : undefined}>
            {live && i !== reached ? (
              <button
                type="button"
                className="adm-road-step"
                onClick={() => onStep(s)}
                title={i > reached ? `Mark as ${STEP_DO[s]}` : `Move back to ${STEP_LABEL[s].toLowerCase()}`}
                aria-label={i > reached ? `Mark as ${STEP_DO[s]}` : `Move back to ${STEP_LABEL[s].toLowerCase()}`}
              >
                {body}
              </button>
            ) : (
              <div className="adm-road-step">{body}</div>
            )}
          </li>
        );
      })}
      {closed && (
        <li className="is-stop" aria-current="step">
          <div className="adm-road-step">
            <i aria-hidden="true">×</i>
            <span>
              <b>{o.status === "cancelled" ? "Cancelled" : "Refunded"}</b>
              <small>{at(o.status) ? when(at(o.status)!) : ""}</small>
            </span>
          </div>
        </li>
      )}
    </ol>
  );
}

// Confirming a step: shipping asks for the courier; going back says what
// will be undone.
function StepForm({
  order: o,
  to,
  busy,
  onCancel,
  onConfirm,
}: {
  order: Order;
  to: OrderStatus;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (opts: { note?: string; carrier?: string; tracking?: string }) => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const from = STEPS.indexOf(o.status);
  const at = STEPS.indexOf(to);
  const back = at < from;
  const ship = o.shipments?.[0];
  const refunded = (o.order_refunds ?? []).length > 0;
  const undone: string[] = [];
  if (back) {
    if (from >= 3 && at < 3 && ship) undone.push(`The courier details${ship.carrier ? ` (${[ship.carrier, ship.tracking_number].filter(Boolean).join(" · ")})` : ""} are removed.`);
    if (from === 4 && at === 3) undone.push("The delivery date is cleared.");
    if (to === "pending") undone.push("The payment is cleared, so the order shows as unpaid again.");
  }
  const blocked = back && to === "pending" && refunded;

  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) onConfirm(back ? { note } : { carrier, tracking });
      }}
    >
      {back ? (
        <>
          <h2>
            Move {o.order_number} back to {STEP_LABEL[to].toLowerCase()}?
          </h2>
          <p className="adm-muted" style={{ margin: 0 }}>
            {blocked
              ? "This order has a refund on it, so it can't go back to unpaid. Undo the refund first if it was a mistake."
              : [`It goes from ${STEP_LABEL[o.status].toLowerCase()} back to ${STEP_LABEL[to].toLowerCase()}.`, ...undone, "Stock doesn't change."].join(" ")}
          </p>
          {!blocked && (
            <label className="adm-label">
              Why (for the activity, optional)
              <input className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tapped by mistake, courier didn't collect…" autoFocus />
            </label>
          )}
        </>
      ) : (
        <>
          <h2>
            {to === "delivered" ? "Mark" : "Ship"} {o.order_number}
            {to === "delivered" ? " as delivered" : ""}
          </h2>
          {to === "delivered" && <p className="adm-muted" style={{ margin: 0 }}>It never went through Shipped. Add the courier if you have it, or leave it blank.</p>}
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
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          {blocked ? "Close" : "Back"}
        </button>
        {!blocked && (
          <button className={`adm-btn ${back ? "bad" : "pri"}`} disabled={busy}>
            {busy ? "Saving" : back ? `Move back to ${STEP_LABEL[to].toLowerCase()}` : to === "delivered" ? "Mark as delivered" : "Mark as shipped"}
          </button>
        )}
      </div>
    </form>
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
