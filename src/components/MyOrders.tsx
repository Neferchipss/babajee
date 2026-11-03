"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/currency";
import { CUSTOMER_LABEL, STEPS, type OrderStatus } from "@/lib/order-status";
import type { Order } from "@/lib/orders-db";
import { photosFor } from "@/lib/product-photos";
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

// ---------------------------------------------------------------- list

// what the row says in bold, in the order's own words
function headline(o: Order): string {
  const ship = o.shipments?.[0];
  const day = (iso?: string | null) => (iso ? DATE.format(new Date(iso)) : "");
  switch (o.status) {
    case "pending":
      return "Order placed";
    case "paid":
      return "Payment received";
    case "packed":
      return "Packed, ready to ship";
    case "shipped":
      return ship?.carrier ? `On its way with ${ship.carrier}` : "On its way";
    case "delivered":
      return ship?.delivered_at ? `Delivered on ${day(ship.delivered_at)}` : "Delivered";
    case "cancelled":
      return `Cancelled on ${day(o.updated_at ?? o.created_at)}`;
    case "refunded":
      return "Refund completed";
  }
}

// the mini road on a list card: one word per step
const SHORT: Record<string, string> = { pending: "Placed", paid: "Paid", packed: "Packed", shipped: "Shipped", delivered: "Delivered" };

const FILTERS: { id: string; label: string; match: (o: Order) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "open", label: "On the way", match: (o) => OPEN(o.status) },
  { id: "done", label: "Delivered", match: (o) => o.status === "delivered" },
  { id: "closed", label: "Cancelled", match: (o) => o.status === "cancelled" || o.status === "refunded" },
];

// The signed-in customer's orders, newest first: a photo, where it is, what it is.
export function MyOrderList() {
  const { status, user } = useAuth();
  const [rows, setRows] = useState<Order[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    if (!user) return;
    db()
      .then((m) => m.listMyOrders(user.id))
      .then(setRows)
      .catch(() => setErr("We could not load your orders. Try again in a moment."));
  }, [user]);

  // no visible title: the page starts straight at the search (screen readers still get one)
  const head = <h1 className="sr-only">Your orders</h1>;

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

  const words = q.trim().toLowerCase();
  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
  const shown = rows.filter(
    (o) =>
      f.match(o) &&
      (!words ||
        o.order_number.toLowerCase().includes(words) ||
        (o.order_items ?? []).some((i) => `${i.product_name} ${i.variant_label}`.toLowerCase().includes(words))),
  );

  return (
    <>
      {head}
      <div className="mo-tools">
        <label className="mo-search">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your orders" aria-label="Search your orders" />
        </label>
        <div className="mo-filters" role="group" aria-label="Show">
          {FILTERS.map((x) => (
            <button key={x.id} type="button" className={filter === x.id ? "is-on" : ""} aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="mo-muted mo-none">No orders match.</p>
      ) : (
        <ul className="mo-cards">
          {shown.map((o) => (
            <OrderRow key={o.id} o={o} />
          ))}
        </ul>
      )}
    </>
  );
}

const photoOf = (i: { slug?: string | null; variant_label: string }) => (i.slug ? photosFor(i.slug, i.variant_label || undefined)[0] : undefined);

function ItemPhoto({ src, size }: { src?: string; size: "s" | "l" }) {
  return (
    <span className={`mo-thumb ${size === "s" ? "is-s" : "is-l"}`} aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" />
      ) : (
        <svg viewBox="0 0 24 24">
          <path d="M6 8h12l-1 12H7L6 8Z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      )}
    </span>
  );
}

function Thumb({ o }: { o: Order }) {
  const items = o.order_items ?? [];
  // the first item that has a photo
  let src: string | undefined;
  for (const i of items) {
    src = i.slug ? photosFor(i.slug, i.variant_label || undefined)[0] : undefined;
    if (src) break;
  }
  return (
    <span className="mo-thumb" aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" />
      ) : (
        <svg viewBox="0 0 24 24">
          <path d="M6 8h12l-1 12H7L6 8Z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      )}
      {items.length > 1 && <b>+{items.length - 1}</b>}
    </span>
  );
}

function OrderRow({ o }: { o: Order }) {
  const items = o.order_items ?? [];
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const what = items.length
    ? `${items[0].product_name}${items[0].variant_label ? ` · ${items[0].variant_label}` : ""}${items.length > 1 ? ` and ${items.length - 1} more` : ""}`
    : "";
  const refunds = o.order_refunds ?? [];
  const back = refunded(o);
  const lastRefund = refunds.at(-1);
  const at = STEPS.indexOf(o.status);
  return (
    <li>
      <Link href={`/orders/view?id=${o.id}`} className={`mo-card is-${TONE[o.status]}`}>
        <span className="mo-row">
          <Thumb o={o} />
          <span className="mo-row-text">
            <b>{headline(o)}</b>
            <span className="mo-row-what">{what}</span>
            <span className="mo-row-meta">
              {o.order_number} · {DATE.format(new Date(o.created_at))} · {count} item{count === 1 ? "" : "s"}
            </span>
          </span>
          <span className="mo-row-amt">{money(o.total)}</span>
          <span className="mo-chev" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <path d="m8 5 5 5-5 5" />
            </svg>
          </span>
        </span>
        {OPEN(o.status) && (
          <span className="mo-mini" aria-label={`${CUSTOMER_LABEL[o.status]}: step ${at + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={i < at ? "is-done" : i === at ? "is-now" : ""}>
                <i aria-hidden="true">{i < at ? "✓" : ""}</i>
                <small>{SHORT[s]}</small>
              </span>
            ))}
          </span>
        )}
        {back > 0 && (
          <span className="mo-refund">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
            </svg>
            <span>
              Refund of <b>{money(back)}</b>
              {lastRefund?.created_at ? ` completed on ${DATE.format(new Date(lastRefund.created_at))}` : " completed"}
            </span>
          </span>
        )}
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
  // the latest time it arrived at a step: the shop can move an order back and on again
  const at = (s: string) => (s === "pending" ? o.created_at : events.filter((e) => e.status === s).at(-1)?.created_at);
  const reached = closed ? Math.max(0, ...STEPS.map((s, i) => (at(s) ? i : -1))) : STEPS.indexOf(o.status);
  const ship = o.shipments?.[0];
  const back = refunded(o);
  const items = o.order_items ?? [];
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const placedOn = DATE.format(new Date(o.created_at));
  const cover = items.map(photoOf).find(Boolean);
  const lastRefund = (o.order_refunds ?? []).at(-1);

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
      {placed && <p className="mo-thanks">Thank you. Your order is in.</p>}

      <section className={`mo-hero is-${TONE[o.status]}`}>
        <div className="mo-hero-top">
          <span className="mo-hero-photo">
            <ItemPhoto src={cover} size="l" />
            {items.length > 1 && <b>+{items.length - 1}</b>}
          </span>
          <div className="mo-hero-text">
            <p className="mo-kicker">
              <Link href="/orders">Your orders</Link> / {o.order_number} · placed {placedOn}
            </p>
            <h1>{headline[o.status]}</h1>
            <p className="mo-lede">{lede[o.status]}</p>
          </div>
          <div className="mo-total">
            <span>Total</span>
            <b>{money(o.total)}</b>
          </div>
        </div>

        {back > 0 && (
          <div className="mo-refund">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
            </svg>
            <span>
              Refund of <b>{money(back)}</b>
              {lastRefund?.created_at ? ` completed on ${DATE.format(new Date(lastRefund.created_at))}` : " completed"}. It goes back the way you paid.
            </span>
          </div>
        )}

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
            const t = i <= reached ? at(s) : undefined;
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
                  <ItemPhoto src={photoOf(i)} size="s" />
                  <span className="mo-name">
                    {i.product_name}
                    <small>
                      {[i.variant_label, `${i.quantity} × ${money(i.unit_price)}`].filter(Boolean).join(" · ")}
                    </small>
                    {out > 0 && <em className="mo-tag">{out === i.quantity ? "Refunded" : `${out} refunded`}</em>}
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
            <h2>{o.status === "delivered" ? "Delivered to" : "Delivering to"}</h2>
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
            <p className="mo-help">
              Need help? Get in touch and quote <b>{o.order_number}</b>.
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
