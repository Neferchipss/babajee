"use client";

import { useEffect, useState } from "react";
import { when } from "@/components/admin/ui";
import { STEPS, type OrderStatus } from "@/lib/order-status";
import { getCouriers, type Order } from "@/lib/orders-db";

// Where the order has got to, as a road: placed, paid, packed, shipped,
// delivered, each with when it happened. Every step is a button: tap one
// ahead to move the order on, one behind to take it back. A step the shop
// jumped past shows as skipped; a cancelled or refunded order ends the road
// where it stopped and can no longer be moved.
export const STEP_LABEL: Record<string, string> = { pending: "Placed", paid: "Paid", packed: "Packed", shipped: "Shipped", delivered: "Delivered" };
export const STEP_DO: Record<string, string> = { pending: "unpaid", paid: "paid", packed: "packed", shipped: "shipped", delivered: "delivered" };
export function Roadmap({ order: o, busy, onStep }: { order: Order; busy: boolean; onStep: (s: OrderStatus) => void }) {
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
export function StepForm({
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
        if (blocked) return;
        if (!back) rememberCourier(carrier);
        onConfirm(back ? { note } : { carrier, tracking });
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
            <CourierInput id="ov-step-couriers" value={carrier} onChange={setCarrier} />
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
// couriers used before on this device, most recent first, then the common ones
export const COURIER_KEY = "bj-couriers";
export function knownCouriers(shop?: string[] | null): string[] {
  let mine: string[] = [];
  try {
    mine = JSON.parse(localStorage.getItem(COURIER_KEY) ?? "[]") as string[];
  } catch {}
  return [...new Set([...mine, ...(shop?.length ? shop : ["Delhivery", "DTDC", "Blue Dart", "India Post", "Xpressbees", "Ekart", "Shadowfax"])])];
}
// the same, with the shop's own list from Settings › Delivery and couriers (0079)
export function useCouriers(): string[] {
  const [shop, setShop] = useState<string[] | null>(null);
  useEffect(() => {
    getCouriers()
      .then(setShop)
      .catch(() => {});
  }, []);
  return knownCouriers(shop);
}
// a courier box with the known couriers to pick from
export function CourierInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const list = useCouriers();
  return (
    <>
      <input className="adm-input" list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={list.slice(0, 3).join(", ") + "…"} autoFocus />
      <datalist id={id}>
        {list.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
export function rememberCourier(name: string) {
  const c = name.trim();
  if (!c) return;
  try {
    const mine = JSON.parse(localStorage.getItem(COURIER_KEY) ?? "[]") as string[];
    localStorage.setItem(COURIER_KEY, JSON.stringify([c, ...mine.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 6)));
  } catch {}
}
