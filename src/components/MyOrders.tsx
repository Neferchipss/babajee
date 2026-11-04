"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { addToCart } from "@/lib/cart";
import { formatPrice } from "@/lib/currency";
import { CUSTOMER_LABEL, STEPS, type OrderStatus } from "@/lib/order-status";
import type { Order, OrderRequest } from "@/lib/orders-db";
import { categoryTone } from "@/lib/tone";
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
              {(o.order_requests ?? []).some((r) => r.status === "open") && (
                <span className="mo-asked"> · {(o.order_requests ?? []).find((r) => r.status === "open")!.kind === "cancel" ? "Cancellation asked" : "Return asked"}</span>
              )}
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
  const [returnDays, setReturnDays] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!user) return;
    db()
      .then((m) => m.getOrder(id))
      .then(setO)
      .catch(() => setO(null));
  }, [user, id, tick]);
  useEffect(() => {
    db()
      .then((m) => m.getSettings())
      .then((s) => setReturnDays(s.return_days))
      .catch(() => setReturnDays(0));
  }, []);

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

        <OrderActions o={o} returnDays={returnDays} deliveredAt={ship?.delivered_at ?? at("delivered") ?? null} onChanged={() => setTick((t) => t + 1)} />
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

// ---------------------------------------------------------------- what the customer can do

const DAY_MS = 864e5;

// Buy again, cancel, ask for a return, and where any request stands.
function OrderActions({ o, returnDays, deliveredAt, onChanged }: { o: Order; returnDays: number | null; deliveredAt: string | null; onChanged: () => void }) {
  const [open, setOpen] = useState<"cancel" | "return" | null>(null);
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const items = o.order_items ?? [];
  const reqs = (o.order_requests ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last: OrderRequest | undefined = reqs.at(-1);
  const pending = last?.status === "open" ? last : undefined;
  const refundedQty = (id: string) =>
    (o.order_refunds ?? []).reduce((n, r) => n + (r.order_refund_items ?? []).filter((x) => x.order_item_id === id).reduce((m, x) => m + x.quantity, 0), 0);
  const returnable = items.map((i) => ({ ...i, left: i.quantity - refundedQty(i.id) })).filter((i) => i.left > 0);

  const canCancel = !pending && ["pending", "paid", "packed"].includes(o.status);
  const until = deliveredAt && returnDays ? new Date(new Date(deliveredAt).getTime() + returnDays * DAY_MS) : null;
  // the return window is a plain date check, done once per render
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const canReturn = !pending && o.status === "delivered" && !!returnDays && returnable.length > 0 && (!until || until.getTime() > now);
  const buyable = items.filter((i) => i.live?.ok);

  function buyAgain() {
    for (const i of buyable) {
      const l = i.live!;
      addToCart(
        { slug: l.slug, href: `/shop/${l.category}?p=${encodeURIComponent(l.slug)}`, name: i.product_name, tone: categoryTone(l.category), variant: l.label, price: l.price },
        i.quantity,
      );
    }
    const missing = items.length - buyable.length;
    setNote(
      `Added ${buyable.reduce((n, i) => n + i.quantity, 0)} item${buyable.reduce((n, i) => n + i.quantity, 0) === 1 ? "" : "s"} to your cart at today's prices.` +
        (missing ? ` ${missing === 1 ? "One item isn't" : `${missing} items aren't`} available any more, so ${missing === 1 ? "it was" : "they were"} left out.` : ""),
    );
  }

  async function send() {
    setBusy(true);
    setErr("");
    try {
      const m = await db();
      if (open === "cancel") {
        const r = await m.cancelMyOrder(o.id, reason.trim());
        setNote(r === "cancelled" ? "Your order is cancelled." : "We've asked the shop to cancel it. You'll see their answer here.");
      } else if (open === "return") {
        await m.requestReturn(
          o.id,
          returnable.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ item: i.id, qty: qty[i.id] })),
          reason.trim(),
        );
        setNote("We've sent your return request. The shop will tell you here what happens next.");
      }
      setOpen(null);
      setReason("");
      setQty({});
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "That didn't go through. Try again.");
    }
    setBusy(false);
  }

  async function withdraw(r: OrderRequest) {
    setBusy(true);
    setErr("");
    try {
      await (await db()).withdrawRequest(r.id);
      setNote("Request withdrawn.");
      onChanged();
    } catch (e) {
      setErr((e as { message?: string })?.message ?? "That didn't go through. Try again.");
    }
    setBusy(false);
  }

  const what = (r: OrderRequest) => (r.kind === "cancel" ? "cancel this order" : "return " + r.items.map((x) => {
    const it = items.find((i) => i.id === x.item);
    return `${it?.product_name ?? "an item"}${x.qty > 1 ? ` ×${x.qty}` : ""}`;
  }).join(", "));
  const picked = returnable.some((i) => (qty[i.id] ?? 0) > 0);
  const paidCancel = o.status !== "pending";

  return (
    <div className="mo-do">
      {last && last.status !== "withdrawn" && (
        <div className={`mo-req is-${last.status}`}>
          {last.status === "open" ? (
            <>
              <span>
                You asked to {what(last)} on {DATE.format(new Date(last.created_at))}. The shop will get back to you here.
              </span>
              <button type="button" className="mo-textbtn" disabled={busy} onClick={() => withdraw(last)}>
                Withdraw
              </button>
            </>
          ) : last.status === "accepted" ? (
            <span>
              The shop accepted your request to {what(last)}.{last.reply ? ` “${last.reply}”` : ""} Any refund shows on this page once it&apos;s sent.
            </span>
          ) : (
            <span>
              The shop couldn&apos;t {last.kind === "cancel" ? "cancel this order" : "take this return"}.{last.reply ? ` “${last.reply}”` : ""}
            </span>
          )}
        </div>
      )}

      <div className="mo-do-row">
        {buyable.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={buyAgain}>
            Buy again
          </button>
        )}
        {canReturn && (
          <button type="button" className="btn btn-ghost" aria-expanded={open === "return"} onClick={() => (setOpen(open === "return" ? null : "return"), setErr(""))}>
            Ask for a return
          </button>
        )}
        {canCancel && (
          <button type="button" className="btn btn-ghost mo-danger" aria-expanded={open === "cancel"} onClick={() => (setOpen(open === "cancel" ? null : "cancel"), setErr(""))}>
            {paidCancel ? "Ask to cancel" : "Cancel order"}
          </button>
        )}
        {o.status === "delivered" && until && !canReturn && !pending && !!returnDays && until.getTime() <= now && (
          <span className="mo-muted mo-small">Returns closed on {DATE.format(until)}.</span>
        )}
        {o.status === "delivered" && until && canReturn && <span className="mo-muted mo-small">Returns open until {DATE.format(until)}.</span>}
        {buyable.length === 0 && items.length > 0 && <span className="mo-muted mo-small">{items.length === 1 ? "This item isn't" : "These items aren't"} on sale right now, so they can&apos;t be bought again.</span>}
      </div>

      {note && (
        <p className="mo-note" role="status">
          {note}
          {note.startsWith("Added") && (
            <>
              {" "}
              <Link href="/cart">Go to your cart</Link>
            </>
          )}
        </p>
      )}

      {open === "cancel" && (
        <form
          className="mo-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <b>{paidCancel ? "Ask the shop to cancel this order?" : "Cancel this order?"}</b>
          <p className="mo-muted">
            {paidCancel
              ? "You've already paid, so the shop will cancel it and send your money back. If it's already being packed, they'll tell you here."
              : "It hasn't been paid for, so it's cancelled straight away."}
          </p>
          <label>
            <span>Why? (optional)</span>
            <textarea id="mo-cancel-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ordered by mistake, changed my mind…" />
          </label>
          {err && <p className="mo-err">{err}</p>}
          <div className="mo-do-row">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Sending" : paidCancel ? "Ask to cancel" : "Cancel order"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Keep the order
            </button>
          </div>
        </form>
      )}

      {open === "return" && (
        <form
          className="mo-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <b>What would you like to return?</b>
          <ul className="mo-pick">
            {returnable.map((i) => (
              <li key={i.id}>
                <span>
                  {i.product_name}
                  {i.variant_label && <small>{i.variant_label}</small>}
                </span>
                <span className="mo-step" role="group" aria-label={`How many ${i.product_name}`}>
                  <button type="button" aria-label="Fewer" disabled={(qty[i.id] ?? 0) <= 0} onClick={() => setQty({ ...qty, [i.id]: (qty[i.id] ?? 0) - 1 })}>
                    −
                  </button>
                  <output>{qty[i.id] ?? 0}</output>
                  <button type="button" aria-label="More" disabled={(qty[i.id] ?? 0) >= i.left} onClick={() => setQty({ ...qty, [i.id]: (qty[i.id] ?? 0) + 1 })}>
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <label>
            <span>What&apos;s wrong?</span>
            <textarea id="mo-return-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Arrived broken, wrong item, not as described…" />
          </label>
          {err && <p className="mo-err">{err}</p>}
          <div className="mo-do-row">
            <button className="btn btn-primary" disabled={busy || !picked || !reason.trim()}>
              {busy ? "Sending" : "Send return request"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Not now
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
