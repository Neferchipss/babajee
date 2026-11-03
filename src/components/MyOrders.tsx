"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/currency";
import { CUSTOMER_LABEL, STEPS, type OrderStatus } from "@/lib/order-status";
import type { Order } from "@/lib/orders-db";
import "./my-orders.css";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const money = (n: number) => formatPrice(n, { paise: n % 1 !== 0 });
const db = () => import("@/lib/orders-db");

// one word on how the order is doing, for the colour of its chip and card
type Tone = "wait" | "move" | "done" | "off";
const TONE: Record<OrderStatus, Tone> = {
  pending: "wait",
  paid: "move",
  packed: "move",
  shipped: "move",
  delivered: "done",
  cancelled: "off",
  refunded: "off",
};
const OPEN = (s: OrderStatus) => s !== "delivered" && s !== "cancelled" && s !== "refunded";
const refunded = (o: Order) => (o.order_refunds ?? []).reduce((n, r) => n + r.amount, 0);

// "Alien Grinder · Silver and 2 more"
function summary(o: Order) {
  const items = o.order_items ?? [];
  if (!items.length) return "";
  const first = `${items[0].product_name}${items[0].variant_label ? ` · ${items[0].variant_label}` : ""}`;
  return items.length > 1 ? `${first} and ${items.length - 1} more` : first;
}

function SignedOut() {
  return (
    <div className="mo-empty">
      <p>Log in to see your orders.</p>
      <Link href="/account/login" className="btn btn-primary">
        Log in
      </Link>
    </div>
  );
}

function Chip({ status }: { status: OrderStatus }) {
  return (
    <span className={`mo-chip is-${TONE[status]}`}>
      <i aria-hidden="true" />
      {CUSTOMER_LABEL[status]}
    </span>
  );
}

// a five-step bar, filled up to where the order is
function Bar({ status }: { status: OrderStatus }) {
  const at = STEPS.indexOf(status);
  return (
    <span className="mo-bar" aria-hidden="true">
      {STEPS.map((s, i) => (
        <i key={s} className={i <= at ? "on" : ""} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- list

// The signed-in customer's orders: the ones still on their way first, then the rest.
export function MyOrderList() {
  const { status, user } = useAuth();
  const [rows, setRows] = useState<Order[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!user) return;
    db()
      .then((m) => m.listMyOrders(user.id))
      .then(setRows)
      .catch(() => setErr("We could not load your orders. Try again in a moment."));
  }, [user]);

  const head = (
    <header className="mo-head">
      <h1>Your orders</h1>
      <Link href="/shop" className="mo-link">
        Back to the shop
      </Link>
    </header>
  );

  if (status === "loading") return head;
  if (status !== "in")
    return (
      <>
        {head}
        <SignedOut />
      </>
    );
  if (err)
    return (
      <>
        {head}
        <p className="mo-err">{err}</p>
      </>
    );
  if (!rows)
    return (
      <>
        {head}
        <p className="mo-muted">Loading your orders.</p>
      </>
    );
  if (!rows.length)
    return (
      <>
        {head}
        <div className="mo-empty">
          <p>No orders yet. Anything you buy shows up here, with where it has got to.</p>
          <Link href="/shop" className="btn btn-primary">
            Go to the shop
          </Link>
        </div>
      </>
    );

  const open = rows.filter((o) => OPEN(o.status));
  const past = rows.filter((o) => !OPEN(o.status));
  return (
    <>
      {head}
      {open.length > 0 && (
        <section className="mo-group">
          <h2>On the way to you</h2>
          <ul className="mo-cards">
            {open.map((o) => (
              <OrderCard key={o.id} o={o} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="mo-group">
          <h2>Past orders</h2>
          <ul className="mo-cards">
            {past.map((o) => (
              <OrderCard key={o.id} o={o} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function OrderCard({ o }: { o: Order }) {
  const back = refunded(o);
  const count = (o.order_items ?? []).reduce((n, i) => n + i.quantity, 0);
  return (
    <li>
      <Link href={`/orders/view?id=${o.id}`} className={`mo-card is-${TONE[o.status]}`}>
        <span className="mo-card-top">
          <Chip status={o.status} />
          <b className="mo-amt">{money(o.total)}</b>
        </span>
        <span className="mo-what">{summary(o)}</span>
        {OPEN(o.status) && <Bar status={o.status} />}
        <span className="mo-card-foot">
          <span>
            {o.order_number} · {DATE.format(new Date(o.created_at))} · {count} item{count === 1 ? "" : "s"}
            {back > 0 && o.status !== "refunded" && <span className="mo-back"> · {money(back)} refunded</span>}
          </span>
          <span className="mo-arrow" aria-hidden="true">
            →
          </span>
        </span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------- one order

// One order: what's happening now in big type, the road it's on, then
// what's in it and where it's going.
export function MyOrder() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const placed = params.has("placed");
  const { status, user } = useAuth();
  const [o, setO] = useState<Order | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!user) return;
    db()
      .then((m) => m.getOrder(id))
      .then(setO)
      .catch(() => setO(null));
  }, [user, id]);

  if (status === "loading" || (status === "in" && o === undefined)) return <p className="mo-muted">Loading your order.</p>;
  if (status !== "in") return <SignedOut />;
  if (!o)
    return (
      <div className="mo-empty">
        <p>We couldn&apos;t find this order.</p>
        <Link href="/orders" className="btn btn-primary">
          All your orders
        </Link>
      </div>
    );

  const closed = o.status === "cancelled" || o.status === "refunded";
  const events = (o.order_events ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const at = (s: string) => (s === "pending" ? o.created_at : events.find((e) => e.status === s)?.created_at);
  const reached = closed ? Math.max(0, ...STEPS.map((s, i) => (at(s) ? i : -1))) : STEPS.indexOf(o.status);
  const ship = o.shipments?.[0];
  const back = refunded(o);
  const items = o.order_items ?? [];
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const placedOn = DATE.format(new Date(o.created_at));

  const headline: Record<OrderStatus, string> = {
    pending: "Order received",
    paid: "Payment received",
    packed: "Packed",
    shipped: "On its way",
    delivered: "Delivered",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };
  const lede: Record<OrderStatus, string> = {
    pending: "We'll get in touch to confirm payment. Nothing else to do for now.",
    paid: "We're getting your order ready to pack.",
    packed: "Packed and waiting for the courier to pick it up.",
    shipped: `With ${ship?.carrier || "the courier"} and heading to ${o.address_city}.`,
    delivered: `Delivered${ship?.delivered_at ? ` on ${DAY.format(new Date(ship.delivered_at))}` : ""}. Enjoy.`,
    cancelled: `This order was cancelled. Questions? Get in touch and quote ${o.order_number}.`,
    refunded: `${money(back || o.total)} has been refunded to you.`,
  };

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  return (
    <div className="mo">
      <Link href="/orders" className="mo-link mo-back">
        ← All your orders
      </Link>

      {placed && <p className="mo-thanks">Thank you. Your order is in.</p>}

      <section className={`mo-hero is-${TONE[o.status]}`}>
        <div className="mo-hero-top">
          <div>
            <p className="mo-kicker">
              Order {o.order_number} · placed {placedOn}
            </p>
            <h1>{headline[o.status]}</h1>
            <p className="mo-lede">{lede[o.status]}</p>
          </div>
          <div className="mo-total">
            <span>{back > 0 ? "Paid" : "Total"}</span>
            <b>{money(o.total)}</b>
            {back > 0 && <small>{money(back)} refunded</small>}
          </div>
        </div>

        {o.status === "shipped" && ship?.tracking_number && (
          <div className="mo-track">
            <span>
              <small>{ship.carrier || "Courier"} tracking number</small>
              <b>{ship.tracking_number}</b>
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => copy(ship.tracking_number!)}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        <ol className={`mo-road ${closed ? "is-closed" : ""}`} aria-label="Order progress">
          {STEPS.map((s, i) => {
            const t = at(s);
            const state = i < reached ? (t ? "done" : "skip") : i === reached ? (closed ? "done" : "now") : "next";
            return (
              <li key={s} className={`is-${state}`} aria-current={state === "now" ? "step" : undefined}>
                <i aria-hidden="true">{state === "done" ? "✓" : ""}</i>
                <span>
                  <b>{CUSTOMER_LABEL[s]}</b>
                  <small>{t ? `${DAY.format(new Date(t))}, ${TIME.format(new Date(t)).toLowerCase()}` : state === "skip" ? "" : state === "now" ? "Now" : "Not yet"}</small>
                </span>
              </li>
            );
          })}
          {closed && (
            <li className="is-stop" aria-current="step">
              <i aria-hidden="true">×</i>
              <span>
                <b>{headline[o.status]}</b>
                <small>{at(o.status) ? DAY.format(new Date(at(o.status)!)) : ""}</small>
              </span>
            </li>
          )}
        </ol>
      </section>

      <div className="mo-grid">
        <section className="mo-panel">
          <h2>
            {count} item{count === 1 ? "" : "s"}
          </h2>
          <ul className="mo-items">
            {items.map((i) => {
              const out = (o.order_refunds ?? []).reduce((n, r) => n + (r.order_refund_items ?? []).filter((x) => x.order_item_id === i.id).reduce((m, x) => m + x.quantity, 0), 0);
              return (
                <li key={i.id} className={out === i.quantity ? "is-back" : ""}>
                  <span className="mo-qty">{i.quantity}×</span>
                  <span className="mo-name">
                    {i.product_name}
                    {i.variant_label && <small>{i.variant_label}</small>}
                    {out > 0 && <small className="mo-back">{out === i.quantity ? "Refunded" : `${out} refunded`}</small>}
                  </span>
                  <span className="mo-price">{money(i.unit_price * i.quantity)}</span>
                </li>
              );
            })}
          </ul>
          <dl className="mo-bill">
            <dt>Items</dt>
            <dd>{money(o.subtotal)}</dd>
            <dt>Delivery</dt>
            <dd>{o.shipping ? money(o.shipping) : "Free"}</dd>
            {o.tax > 0 && (
              <>
                <dt>{o.gst_inclusive ? `Includes GST (${o.gst_rate}%)` : `GST (${o.gst_rate}%)`}</dt>
                <dd>{money(o.tax)}</dd>
              </>
            )}
            <dt className="tot">Total</dt>
            <dd className="tot">{money(o.total)}</dd>
            {(o.order_refunds ?? []).map((r) => (
              <FragmentRow key={r.id} label={`${r.returned ? "Return refunded" : "Refunded"} ${DAY.format(new Date(r.created_at))}`} value={`−${money(r.amount)}`} />
            ))}
          </dl>
        </section>

        <div className="mo-side">
          <section className="mo-panel">
            <h2>Delivering to</h2>
            <address className="mo-addr">
              <b>{o.contact_name}</b>
              <span>{o.address_line1}</span>
              {o.address_line2 && <span>{o.address_line2}</span>}
              {o.address_landmark && <span>Near {o.address_landmark}</span>}
              <span>
                {o.address_city}, {o.address_state} {o.address_pincode}
              </span>
              <span className="mo-muted">{o.contact_phone}</span>
            </address>
          </section>
          <section className="mo-panel mo-help">
            <h2>Need help?</h2>
            <p>
              Get in touch and quote <b>{o.order_number}</b>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="mo-back">{label}</dt>
      <dd className="mo-back">{value}</dd>
    </>
  );
}
