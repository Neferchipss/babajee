"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import AddressMap from "@/components/admin/AddressMap";
import { EditForm, RefundForm, type EditInput, type RefundInput } from "@/components/admin/OrderForms";
import { LogContactForm, MarkPaidForm } from "@/components/admin/PaymentForms";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money, StatusPill, when } from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import { actionsFor, eventText, STEPS, type OrderAction, type OrderStatus } from "@/lib/order-status";
import { gstLabel } from "@/lib/gst";
import { trackLink } from "@/lib/tracking";
import { addOrderComment, cameBack, deliveryFailed, FAIL_REASONS, sendAgain, editOrder, errText, getOrder, getSettings, paymentsFor, refundOrder, refundsOf, resolveRequest, setOrderNotes, setStep, settleBalance, setBuyerGstin, updateOrder, undoRefund, type Order, type OrderRequest, type Payment, type Refund } from "@/lib/orders-db";
import { Confirm } from "@/components/admin/order/Confirm";
import { Roadmap, STEP_DO, STEP_LABEL, StepForm } from "@/components/admin/order/Steps";
import { OrderProfit } from "@/components/admin/order/OrderProfit";
import { BuyerGstin } from "@/components/admin/order/BuyerGstin";

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
  // a failed delivery: recording it, sending it again, the parcel coming back
  const [failing, setFailing] = useState(false);
  const [failWhy, setFailWhy] = useState(FAIL_REASONS[0]);
  const [failNote, setFailNote] = useState("");
  const [resending, setResending] = useState(false);
  const [reCarrier, setReCarrier] = useState("");
  const [reTracking, setReTracking] = useState("");
  const [comingBack, setComingBack] = useState(false);
  const [backConfirm, setBackConfirm] = useState(false);
  const [reply, setReply] = useState("");
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState("");
  // manual payment (0056): marking it paid with how it was paid, logging contacts
  const [paying, setPaying] = useState(false);
  const [logging, setLogging] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [methods, setMethods] = useState<string[]>(["UPI", "Bank transfer", "Cash"]);
  useEffect(() => {
    getSettings()
      .then((s) => setMethods(s.payment_methods))
      .catch(() => {});
  }, []);
  const load = useCallback(
    () =>
      getOrder(id)
        .then((r) => {
          setO(r);
          if (r) paymentsFor([r.id]).then(setPayments).catch(() => setPayments([]));
          setNotes(r?.notes ?? "");
          // from the list's "Ship…": straight to the courier form
          const u = new URLSearchParams(window.location.search);
          if (u.get("step") === "shipped") {
            if (r?.status === "packed") setStepping("shipped");
            u.delete("step");
            window.history.replaceState(null, "", `${window.location.pathname}?${u}`);
          }
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
      setFailing(false);
      setResending(false);
      setComingBack(false);
      setBackConfirm(false);
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
  // an issued invoice can't change (0051): refund instead, which issues a credit note
  const canEdit = ["pending", "paid", "packed"].includes(o.status) && refunds.amount === 0 && !o.invoice_number;
  const canRefund = ["paid", "packed", "shipped", "delivered"].includes(o.status) && left > 0;
  const canReturn = ["shipped", "delivered"].includes(o.status) && left > 0 && items.some((i) => i.quantity > (refunds.byItem.get(i.id) ?? 0));
  const balance = paid == null || o.status === "cancelled" || o.status === "refunded" ? 0 : Math.round((o.total - paid) * 100) / 100;

  const placed = when(o.created_at).toLowerCase();
  const closedAt = (o.order_events ?? []).find((e) => e.status === o.status)?.created_at;
  const cameBackAt = o.status === "refunded" ? (o.order_events ?? []).find((e) => e.status === "refunded" && e.note.startsWith("Came back undelivered"))?.created_at : undefined;
  const cancel = actions.find((a) => a.to === "cancelled");
  const nextStep = actions.find((a) => a.primary);
  // a click on the road: forward steps that need nothing go straight
  // through; shipping asks for the courier; going back asks first
  function pickStep(to: OrderStatus) {
    if (!o || to === o.status) return;
    const forward = STEPS.indexOf(to) > STEPS.indexOf(o.status);
    // leaving unpaid always goes through "Mark paid": how was it paid?
    if (forward && o.status === "pending") return setPaying(true);
    if (!forward || to === "shipped" || (to === "delivered" && !ship)) setStepping(to);
    else void act(() => setStep(o.id, to), `${o.order_number} marked as ${STEP_DO[to]}`);
  }
  const phone = o.contact_phone.replace(/\D/g, "");
  const wa = phone.length === 10 ? `91${phone}` : phone.length === 12 && phone.startsWith("91") ? phone : "";
  // status changes already sit on the road; activity keeps everything else
  const activity = (o.order_events ?? []).filter(
    (e) => ["comment", "edited", "refund", "return", "balance", "refund_undone", "request", "delivery_failed", "sent_again"].includes(e.status) || ((e.status === "cancelled" || e.status === "refunded") && e.note),
  );

  const next =
    o.status === "pending"
      ? `Waiting for ${money(o.total)}. Contact ${o.contact_name.split(" ")[0]} to take payment, then mark it paid.`
      : o.status === "paid"
        ? `Paid. Pack the ${count} item${count === 1 ? "" : "s"} next.`
        : o.status === "packed"
          ? "Packed. Mark it shipped once it's with the courier."
          : o.status === "shipped" && o.delivery_failed_at
            ? "The courier couldn't deliver it. Send it again, or take it back in once it returns."
            : o.status === "shipped"
            ? `On its way${ship?.carrier ? ` with ${ship.carrier}` : ""}. Mark it delivered when it arrives.`
            : o.status === "delivered"
              ? `Delivered${ship?.delivered_at ? ` ${when(ship.delivered_at).toLowerCase()}` : ""}. Nothing left to do.`
              : o.status === "cancelled"
                ? `Cancelled${closedAt ? ` ${when(closedAt).toLowerCase()}` : ""}.`
                : cameBackAt
                  ? `Came back undelivered ${when(cameBackAt).toLowerCase()}. ${money(refunds.amount)} refunded${refunds.amount < (paid ?? 0) ? `, ${money((paid ?? 0) - refunds.amount)} kept` : ""}.`
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
              {o.status === "shipped" && o.delivery_failed_at && <span className="adm-pill warn">Delivery failed</span>}
            </h1>
            <p className="ov-next">{next}</p>
            <p className="adm-muted adm-small ov-meta">
              Placed {placed} · {count} item{count === 1 ? "" : "s"} · {o.contact_name}, {o.address_city}
            </p>
            {payments
              .filter((x) => x.status === "captured")
              .map((x) => (
                <p key={x.id} className="adm-small ov-paid">
                  Paid {money(x.amount)}
                  {x.method ? ` by ${x.method}` : " (method not recorded)"}
                  {x.reference ? ` · ref ${x.reference}` : ""}
                  {x.received_on ? ` · received ${new Date(`${x.received_on}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  {x.note ? ` · ${x.note}` : ""}
                </p>
              ))}
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

        {(
          <div className="ov-actions">
            {/* the next step, plainly; the road above still moves it either way */}
            {nextStep && !openReq && !(o.status === "shipped" && o.delivery_failed_at) && (
              <button type="button" className="adm-btn pri" disabled={busy} onClick={() => pickStep(nextStep.to)}>
                {nextStep.label}
              </button>
            )}
            {o.status === "pending" && (
              <button type="button" className="adm-btn" onClick={() => setLogging(true)}>
                Log a contact
              </button>
            )}
            {STEPS.includes(o.status) && <span className="adm-muted adm-small">Or tap a step on the road, forward or back.</span>}
            <span className="ov-gap" />
            {o.paid_total != null && o.status !== "cancelled" && (
              <Link href={`/admin/orders/print?ids=${o.id}&doc=invoice`} className="adm-btn" target="_blank">
                {o.invoice_number ? `Invoice ${o.invoice_number}` : "Invoice"}
              </Link>
            )}
            {o.invoice_number && (o.order_refunds ?? []).length > 0 && (
              <Link href={`/admin/orders/print?ids=${o.id}&doc=cn`} className="adm-btn" target="_blank">
                Credit notes
              </Link>
            )}
            {o.status === "shipped" && !o.delivery_failed_at && (
              <button type="button" className="adm-btn" disabled={busy} onClick={() => (setFailWhy(FAIL_REASONS[0]), setFailNote(""), setFailing(true))}>
                Delivery failed
              </button>
            )}
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
      {o.status === "shipped" && o.delivery_failed_at && (
        <div className="ov-request is-fail">
          <div>
            <b>Delivery failed{(o.delivery_attempts ?? 0) > 1 ? ` (${o.delivery_attempts} times)` : ""}</b>
            <span>
              {o.delivery_failed_reason || "Not delivered"} · {when(o.delivery_failed_at)}
              {wa && (
                <>
                  {" · "}
                  <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${o.contact_name.split(" ")[0]}, the courier couldn't deliver your Babajee order ${o.order_number}. Could you confirm your address and a good time to deliver?`)}`} target="_blank" rel="noreferrer">
                    Message on WhatsApp
                  </a>
                </>
              )}
            </span>
          </div>
          <div className="ov-request-do">
            <button type="button" className="adm-btn pri" disabled={busy} onClick={() => (setReCarrier(ship?.carrier ?? ""), setReTracking(""), setResending(true))}>
              Send again
            </button>
            <button
              type="button"
              className="adm-btn"
              disabled={busy}
              onClick={() => {
                if (canReturn) {
                  setComingBack(true);
                  setForm("return");
                } else setBackConfirm(true);
              }}
            >
              Returned to origin (RTO)
            </button>
          </div>
        </div>
      )}
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
            <b>{balance > 0 ? `Amount due: ${money(balance)}` : `Amount refundable: ${money(-balance)}`}</b>
            {balance > 0 ? " · the order was edited after it was paid." : " · the order was edited after it was paid."}
          </span>
          <button type="button" className="adm-btn" disabled={busy} onClick={() => act(() => settleBalance(o.id), balance > 0 ? `${money(balance)} marked as received` : `${money(-balance)} marked as refunded`)}>
            {balance > 0 ? "Mark payment received" : "Mark refund paid"}
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
                  <span>{gstLabel(o.gst_inclusive, o.gst_rate)}</span>
                  <span>{money(o.tax)}</span>
                </>
              )}
              {(o.cess ?? 0) > 0 && (
                <>
                  <span>{o.gst_inclusive ? "Includes cess" : "Cess"}</span>
                  <span>{money(o.cess ?? 0)}</span>
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
                    {/* a refund on an invoiced order has a credit note, so it stays (0051) */}
                    {o.status !== "cancelled" && !o.invoice_number && (
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
                    <strong>Net profit (after GST)</strong>
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
              {[o.address_line1, o.address_line2, o.address_landmark && (/^near\b/i.test(o.address_landmark.trim()) ? o.address_landmark.trim() : `Near ${o.address_landmark}`), `${o.address_city}, ${o.address_state} ${o.address_pincode}`]
                .filter(Boolean)
                .map((l) => (
                  <span key={String(l)}>{l}</span>
                ))}
            </p>
            <AddressMap lat={o.address_latitude} lng={o.address_longitude} label={`${o.contact_name}, ${o.address_line1}`} />
            <BuyerGstin key={`${o.id}-${o.buyer_gstin ?? ""}`} o={o} busy={busy} onSave={(g) => act(() => setBuyerGstin(o.id, g), g ? "Buyer's GSTIN saved" : "Buyer's GSTIN removed")} />
            {ship && (
              <>
                <h3 className="ov-h3">Courier</h3>
                <p className="adm-small ov-addr">
                  <span>{ship.carrier || "Courier not noted"}</span>
                  {ship.tracking_number && (
                    <span>
                      Tracking <b className="ov-track">{ship.tracking_number}</b>
                      {trackLink(ship.carrier, ship.tracking_number) && (
                        <>
                          {" · "}
                          <a href={trackLink(ship.carrier, ship.tracking_number)!.url} target="_blank" rel="noopener noreferrer">
                            Track on {trackLink(ship.carrier, ship.tracking_number)!.site}
                          </a>
                        </>
                      )}
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
      <Dialog open={paying} onClose={() => setPaying(false)}>
        {paying && (
          <MarkPaidForm
            order={o}
            methods={methods}
            onCancel={() => setPaying(false)}
            onDone={() => {
              setPaying(false);
              toast(`${o.order_number} marked as paid`);
              void load();
            }}
          />
        )}
      </Dialog>
      <Dialog open={logging} onClose={() => setLogging(false)}>
        {logging && (
          <LogContactForm
            order={o}
            userId={user?.id}
            onCancel={() => setLogging(false)}
            onDone={() => {
              setLogging(false);
              toast(`Logged on ${o.order_number}`);
            }}
          />
        )}
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
                {busy ? "Reversing" : "Reverse refund"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog open={failing} onClose={() => setFailing(false)}>
        {failing && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => deliveryFailed(o.id, failWhy, failNote.trim()), `${o.order_number}: delivery failed recorded`);
            }}
          >
            <h2>Delivery failed?</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              From what the courier told you. The order stays shipped; next you send it again, or take it back in when it returns.
            </p>
            <label className="adm-label">
              What happened
              <select className="adm-input" value={failWhy} onChange={(e) => setFailWhy(e.target.value)}>
                {FAIL_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="adm-label">
              Note (optional, only staff see it)
              <input className="adm-input" value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="Courier tried twice, gate locked" />
            </label>
            <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="adm-btn" onClick={() => setFailing(false)}>
                Back
              </button>
              <button className="adm-btn pri" disabled={busy}>
                {busy ? "Saving" : "Record it"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog open={resending} onClose={() => setResending(false)}>
        {resending && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => sendAgain(o.id, { carrier: reCarrier, tracking: reTracking }), `${o.order_number} sent again`);
            }}
          >
            <h2>Send it again</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              The order carries on as shipped. Add the new tracking number if the courier gave one.
            </p>
            <label className="adm-label">
              Courier
              <input className="adm-input" value={reCarrier} onChange={(e) => setReCarrier(e.target.value)} placeholder="Delhivery" />
            </label>
            <label className="adm-label">
              New tracking number (optional)
              <input className="adm-input" value={reTracking} onChange={(e) => setReTracking(e.target.value)} />
            </label>
            <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="adm-btn" onClick={() => setResending(false)}>
                Back
              </button>
              <button className="adm-btn pri" disabled={busy}>
                {busy ? "Saving" : "Sent again"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog open={backConfirm} onClose={() => setBackConfirm(false)}>
        {backConfirm && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => cameBack(o.id, o.delivery_failed_reason ?? ""), `${o.order_number} closed: came back`);
            }}
          >
            <h2>Returned to origin (RTO)?</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              Nothing is left to refund on this order, so it&apos;s simply closed as came back undelivered.
            </p>
            <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="adm-btn" onClick={() => setBackConfirm(false)}>
                Back
              </button>
              <button className="adm-btn pri" disabled={busy}>
                {busy ? "Saving" : "Close the order"}
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
      <Dialog open={form !== null} onClose={() => (setForm(null), setAnswering(null), setComingBack(false))} wide={form === "edit"}>
        {(form === "refund" || form === "return") && (
          <RefundForm
            order={o}
            mode={form}
            busy={busy}
            onCancel={() => (setForm(null), setAnswering(null), setComingBack(false))}
            onSubmit={(r: RefundInput) =>
              act(
                async () => {
                  await refundOrder(o.id, r);
                  if (answering) await resolveRequest(answering.id, true, "");
                  if (comingBack) await cameBack(o.id, o.delivery_failed_reason ?? "");
                },
                comingBack
                  ? `${o.order_number} came back · ${money(r.amount)} refunded`
                  : answering
                  ? `${answering.kind === "cancel" ? "Cancellation" : "Return"} approved · ${money(r.amount)} refunded`
                  : `${r.returned ? "Return recorded" : "Refunded"} · ${money(r.amount)} on ${o.order_number}`,
              )
            }
            onEdit={canEdit && !answering ? () => setForm("edit") : undefined}
            preset={
              comingBack
                ? { everything: true, restock: true, keepDelivery: true, title: "Came back:", note: `Came back undelivered${o.delivery_failed_reason ? `: ${o.delivery_failed_reason}` : ""}` }
                : answering
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
