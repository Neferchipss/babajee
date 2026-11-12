"use client";

import Link from "next/link";
import SceneLink from "@/components/SceneLink";
import { useEffect, useRef, useState } from "react";
import { type CartLine, cartSums, clearCart, lineTotal, removeLine, restoreLine, setQty, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/currency";
import { bill, gstLabel } from "@/lib/gst";
import type { StoreSettings } from "@/lib/orders-db";
import { toggleSaved } from "@/lib/wishlist";
import CartRecs, { type RecGroup } from "./CartRecs";
import { JarArt } from "./CartJar";
import ProductArt from "./ProductArt";
import "./cart.css";

export type { RecGroup };

const rs = (n: number | undefined) => formatPrice(n, { paise: true });
const buzz = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};

type Undo = { text: string; restore: () => void };

const Bin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

// What is in Baba's jar, laid out like the quick-commerce carts (the site's
// bar above says where it is going): every line in one panel
// (picture, name, how it comes, move to wishlist; the stepper and price on
// the right, its minus a bin at one), tabs of things to add, the bill, and
// how to pay with the pay button in a bar at the bottom. Removing, saving or
// clearing can be undone.
export default function CartView({ recs = [] }: { recs?: RecGroup[] }) {
  const cart = useCart();
  const sums = cartSums(cart);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [clearing, setClearing] = useState(false);
  const undoTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const offerUndo = (u: Undo) => {
    window.clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = window.setTimeout(() => setUndo(null), 5000);
  };
  const remove = (line: CartLine) => {
    const gone = removeLine(line.key);
    buzz(8);
    if (gone) offerUndo({ text: `Removed ${line.name}`, restore: () => restoreLine(gone.line, gone.at) });
  };
  const toWishlist = (line: CartLine) => {
    toggleSaved({ slug: line.slug, href: line.href, name: line.name, tone: line.tone, price: line.price });
    const gone = removeLine(line.key);
    buzz([6, 30, 10]);
    if (gone) offerUndo({ text: `Moved ${line.name} to your wishlist`, restore: () => restoreLine(gone.line, gone.at) });
  };
  const clearAll = () => {
    const before = cart;
    clearCart();
    setClearing(false);
    buzz(12);
    offerUndo({ text: "Cleared the jar", restore: () => before.forEach((l, i) => restoreLine(l, i)) });
  };

  const toast = undo && (
    <div className="cv-toast" role="status">
      <span>{undo.text}</span>
      <button
        type="button"
        onClick={() => {
          undo.restore();
          setUndo(null);
        }}
      >
        Undo
      </button>
    </div>
  );

  // the bar above holds where it is going and the profile button
  const top = <h1 className="sr-only">Your cart</h1>;

  if (cart.length === 0) {
    return (
      <>
        {top}
        <div className="cv-empty">
          <div className="cv-empty-jar">
            <JarArt pebbles={[]} />
          </div>
          <p className="cv-empty-title">The jar is empty.</p>
          <p className="cv-empty-sub">Anything you add drops in here.</p>
          <SceneLink href="/shop" className="btn btn-primary">
            Go to the shop
          </SceneLink>
          {toast}
        </div>
        <CartRecs groups={recs} />
      </>
    );
  }

  // the one way to pay for now; the bank details come at checkout
  const payWith = (
    <div className="cv-paywith">
      <span className="cv-paywith-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
        </svg>
      </span>
      <span className="cv-paywith-text">
        <small>Pay using</small>
        <b>Bank transfer</b>
      </span>
    </div>
  );

  return (
    <div className="cv">
      {top}
      <div className="cv-main">
        <div className="cv-panel">
          <div className="cv-head">
            {clearing ? (
              <p className="cv-confirm">
                Empty the jar?
                <button type="button" className="cv-link cv-link--danger" onClick={clearAll}>
                  Yes, clear
                </button>
                <button type="button" className="cv-link" onClick={() => setClearing(false)}>
                  Keep
                </button>
              </p>
            ) : (
              <button type="button" className="cv-link" onClick={() => setClearing(true)}>
                Clear all
              </button>
            )}
            <p className="cv-count">
              {sums.count} item{sums.count === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="cv-lines">
            {cart.map((line) => {

              const meta = [line.variant !== "Standard" ? line.variant : null, line.unit].filter(Boolean).join(" · ");
              return (
                <li key={line.key} className="cv-line">
                  <Link href={line.href} className="cv-thumb" tabIndex={-1} aria-hidden="true">
                    <ProductArt name={line.name} tone={line.tone} slug={line.slug} option={line.variant} />
                  </Link>
                  <div className="cv-info">
                    <Link href={line.href} className="cv-name">
                      {line.name}
                    </Link>
                    {meta && <p className="cv-meta">{meta}</p>}
                    <button type="button" className="cv-wish" onClick={() => toWishlist(line)}>
                      Move to wishlist
                    </button>
                  </div>
                  <div className="cv-side">
                    <div className="cv-step" role="group" aria-label={`${line.name} quantity`}>
                      <button
                        type="button"
                        aria-label={line.qty === 1 ? `Remove ${line.name}` : `One less ${line.name}`}
                        onClick={() => {
                          if (line.qty === 1) remove(line);
                          else {
                            buzz(5);
                            setQty(line.key, line.qty - 1);
                          }
                        }}
                      >
                        {line.qty === 1 ? <Bin /> : <span aria-hidden="true">&minus;</span>}
                      </button>
                      <span className="cv-qty" aria-live="polite">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`One more ${line.name}`}
                        onClick={() => {
                          buzz(5);
                          setQty(line.key, line.qty + 1);
                        }}
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    </div>
                    <p className="cv-price">
                      <span>{rs(lineTotal(line))}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <CartRecs groups={recs} />
      </div>

      <aside className="cv-sum" aria-label="Bill details">
        <h2 className="cv-sum-title">Bill details</h2>
        <dl>
          <div>
            <dt>Items total</dt>
            <dd>
              {rs(sums.total)}
            </dd>
          </div>

          <div>
            <dt>Delivery</dt>
            <dd className="cv-muted">At checkout</dd>
          </div>
          <div className="cv-total">
            <dt>To pay</dt>
            <dd>{rs(sums.total)}</dd>
          </div>
        </dl>
        <div className="cv-go">
          {payWith}
          <Link href="/checkout" className="cv-pay">
            Pay {rs(sums.total)}
          </Link>
        </div>
      </aside>

      {/* phones: how to pay and the pay button stay in reach */}
      <div className="cv-bar">
        {payWith}
        <Link href="/checkout" className="cv-pay">
          Pay {rs(sums.total)}
        </Link>
      </div>
      {toast}
    </div>
  );
}

// The short list beside the checkout form.
// The bill under the items: delivery and GST from the shop's Settings, worked
// out the same way place_order() will (lib/gst.ts). Until the rules load, or
// if they can't, it shows the plain item total.
// Each product's GST bracket comes from the catalogue; one without its own
// uses the shop's default rate.
function CheckoutBill({ cart, sub }: { cart: CartLine[]; sub: number | undefined }) {
  const [rules, setRules] = useState<StoreSettings | null>(null);
  const [rates, setRates] = useState<Map<string, number | null> | null>(null);
  const slugs = [...new Set(cart.map((l) => l.slug))].sort().join(",");
  useEffect(() => {
    import("@/lib/orders-db")
      .then((m) => m.getSettings())
      .then(setRules)
      .catch(() => {});
  }, []);
  useEffect(() => {
    import("@/lib/orders-db")
      .then((m) => m.gstRates(slugs ? slugs.split(",") : []))
      .then(setRates)
      .catch(() => {});
  }, [slugs]);
  const b =
    sub !== undefined && rules && rates
      ? bill(
          cart.map((l) => ({ gross: lineTotal(l) ?? 0, rate: rates.get(l.slug) ?? rules.gst_rate })),
          rules.free_shipping_over != null && sub >= rules.free_shipping_over ? 0 : rules.shipping,
          rules.gst_inclusive,
        )
      : null;
  return (
    <>
      {b && (
        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Items</dt>
            <dd className="tabular-nums">{rs(b.sub)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd className="tabular-nums">{b.ship ? rs(b.ship) : "Free"}</dd>
          </div>
          {b.tax > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{gstLabel(rules!.gst_inclusive, b.rate)}</dt>
              <dd className="tabular-nums">{rs(b.tax)}</dd>
            </div>
          )}
        </dl>
      )}
      <div className={`${b ? "mt-3" : "mt-5"} flex justify-between border-t border-line pt-4 text-lg font-semibold`}>
        <span>Total</span>
        <span className="tabular-nums">{rs(b ? b.total : sub)}</span>
      </div>
    </>
  );
}

export function CheckoutItems() {
  const cart = useCart();
  const sums = cartSums(cart);
  return (
    <aside className="rounded-xl border border-line bg-iron p-6">
      <h2 className="text-2xl">Your items</h2>
      {cart.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing in the jar yet.{" "}
          <SceneLink href="/shop" className="underline underline-offset-4">
            Go to the shop
          </SceneLink>
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {cart.map((line) => (
            <li key={line.key} className="flex justify-between gap-4 text-sm">
              <span>
                {line.name}
                {line.variant !== "Standard" && <span className="text-muted"> · {line.variant}</span>}{" "}
                <span className="text-muted">x {line.qty}</span>
              </span>
              <span className="tabular-nums">{rs(lineTotal(line))}</span>
            </li>
          ))}
        </ul>
      )}

      <CheckoutBill cart={cart} sub={sums.total} />
    </aside>
  );
}
