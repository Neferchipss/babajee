"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/currency";
import { CUSTOMER_LABEL, STEPS } from "@/lib/order-status";
import type { Order } from "@/lib/orders-db";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });
const money = (n: number) => formatPrice(n, { paise: n % 1 !== 0 });
const db = () => import("@/lib/orders-db");

function SignedOut() {
  return (
    <p className="text-muted">
      <Link href="/account/login" className="font-medium text-paper underline underline-offset-4">
        Log in
      </Link>{" "}
      to see your orders.
    </p>
  );
}

// The signed-in customer's orders, newest first.
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

  if (status === "loading") return <p className="text-muted">Loading.</p>;
  if (status !== "in") return <SignedOut />;
  if (err) return <p className="text-red-soft">{err}</p>;
  if (!rows) return <p className="text-muted">Loading your orders.</p>;
  if (!rows.length)
    return (
      <p className="text-muted">
        No orders yet.{" "}
        <Link href="/shop" className="font-medium text-paper underline underline-offset-4">
          Go to the shop
        </Link>
      </p>
    );
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/view?id=${o.id}`} className="flex items-center justify-between gap-4 py-5 hover:text-rasta-gold">
            <span>
              <span className="block text-lg font-medium">Order {o.order_number}</span>
              <span className="text-sm text-muted">
                Placed {DATE.format(new Date(o.created_at))}. {CUSTOMER_LABEL[o.status]}.
              </span>
            </span>
            <span className="font-medium tabular-nums">{money(o.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// One order: where it has got to, what is in it, and where it is going.
export function MyOrder() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const placed = params.has("placed");
  const { status, user } = useAuth();
  const [o, setO] = useState<Order | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    db()
      .then((m) => m.getOrder(id))
      .then(setO)
      .catch(() => setO(null));
  }, [user, id]);

  if (status === "loading" || (status === "in" && o === undefined)) return <p className="text-muted">Loading your order.</p>;
  if (status !== "in") return <SignedOut />;
  if (!o) return <p className="text-muted">We couldn&apos;t find this order.</p>;

  const closed = o.status === "cancelled" || o.status === "refunded";
  const current = STEPS.indexOf(o.status);
  const ship = o.shipments?.[0];
  const message: Partial<Record<string, string>> = {
    pending: "We've got your order and will get in touch to confirm payment.",
    paid: "Payment received. We're getting your order ready.",
    packed: "Packed and waiting for the courier.",
    shipped: ship?.tracking_number ? `On its way with ${ship.carrier || "the courier"}. Tracking number ${ship.tracking_number}.` : "On its way.",
    delivered: "Delivered. Enjoy.",
    cancelled: "This order was cancelled.",
    refunded: "This order was refunded.",
  };

  return (
    <div>
      <h1 className="text-4xl sm:text-5xl">Order {o.order_number}</h1>
      <p className="mt-4 text-lg text-muted">
        {placed ? "Thank you. Your order is in." : `Placed ${DATE.format(new Date(o.created_at))}`}
      </p>

      {!closed && (
        <ol className="mt-10 grid gap-4 sm:grid-cols-5" aria-label="Order progress">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === current ? "step" : undefined}>
              <span className={`block h-[3px] rounded-full ${i < current ? "bg-rasta-green" : i === current ? "bg-rasta-gold" : "bg-line"}`} aria-hidden="true" />
              <span className={`mt-2 block font-medium ${i === current ? "text-rasta-gold" : ""}`}>{CUSTOMER_LABEL[s]}</span>
              <span className="text-sm text-muted">{i < current ? "Done" : i === current ? "Now" : "Not yet"}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-8 max-w-[60ch] text-lg">{message[o.status]}</p>

      <ul className="mt-8 max-w-xl space-y-3 border-t border-line pt-5">
        {(o.order_items ?? []).map((i) => (
          <li key={i.id} className="flex justify-between gap-4">
            <span>
              {i.product_name}
              {i.variant_label && <span className="text-muted"> · {i.variant_label}</span>} <span className="text-muted">x {i.quantity}</span>
            </span>
            <span className="tabular-nums">{money(i.unit_price * i.quantity)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-4 text-muted">
          <span>Delivery</span>
          <span className="tabular-nums">{o.shipping ? money(o.shipping) : "Free"}</span>
        </li>
        {o.tax > 0 && (
          <li className="flex justify-between gap-4 text-muted">
            <span>{o.gst_inclusive ? `Includes GST (${o.gst_rate}%)` : `GST (${o.gst_rate}%)`}</span>
            <span className="tabular-nums">{money(o.tax)}</span>
          </li>
        )}
        <li className="flex justify-between gap-4 border-t border-line pt-4 text-lg font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(o.total)}</span>
        </li>
        {(o.order_refunds ?? []).map((r) => (
          <li key={r.id} className="flex justify-between gap-4 text-muted">
            <span>{r.returned ? "Return refunded" : "Refunded"}</span>
            <span className="tabular-nums">−{money(r.amount)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-muted">
        Delivering to {o.contact_name}, {o.address_line1}
        {o.address_line2 && `, ${o.address_line2}`}, {o.address_city} {o.address_pincode}
      </p>
      <Link href="/orders" className="mt-8 inline-block text-sm text-muted underline underline-offset-4 hover:text-paper">
        All your orders
      </Link>
    </div>
  );
}
