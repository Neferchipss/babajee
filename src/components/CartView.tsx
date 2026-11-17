"use client";

import Link from "next/link";
import SceneLink from "@/components/SceneLink";
import { useEffect, useRef, useState } from "react";
import { type CartLine, cartSums, clearCart, lineTotal, removeLine, restoreLine, setQty, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/currency";
import { bill, gstLabel } from "@/lib/gst";
import type { StoreSettings } from "@/lib/orders-db";
import { toggleSaved } from "@/lib/wishlist";
import { dropLater, moveToCart, saveForLater, useLater } from "@/lib/later";
import CartRecs, { type RecGroup } from "./CartRecs";
import { JarArt } from "./CartJar";
import ProductArt from "./ProductArt";
import "./cart.css";
import { useCartStock } from "@/lib/cart-stock";

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
  // delivery and GST, as checkout will work them out
  const bt = useBill(cart, sums.total);
  // sold out since it went in, or more than are left
  const stock = useCartStock(cart);
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
  // out of the cart, kept (with its option and quantity) to buy another time
  const later = (line: CartLine) => {
    const gone = removeLine(line.key);
    saveForLater(line);
    buzz([6, 30, 10]);
    if (gone)
      offerUndo({
        text: `Saved ${line.name} for later`,
        restore: () => {
          dropLater(line.key);
          restoreLine(gone.line, gone.at);
        },
      });
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
        <div className="cv-empty-later">
          <SavedForLater />
        </div>
        <CartRecs groups={recs} />
      </>
    );
  }

  // checking out waits until nothing in the jar is sold out or short
  const payLink = stock.blocked ? (
    <span className="cv-pay" aria-disabled="true" data-blocked="true">
      Checkout · {rs(bt.b ? bt.b.total : sums.total)}
    </span>
  ) : (
    <Link href="/checkout" className="cv-pay">
      Checkout · {rs(bt.b ? bt.b.total : sums.total)}
    </Link>
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
              const short = stock.of.get(line.key);
              return (
                <li key={line.key} className="cv-line" data-out={short && "out" in short ? true : undefined}>
                  <Link href={line.href} className="cv-thumb" tabIndex={-1} aria-hidden="true">
                    <ProductArt name={line.name} tone={line.tone} slug={line.slug} option={line.variant} />
                  </Link>
                  <div className="cv-info">
                    <Link href={line.href} className="cv-name">
                      {line.name}
                    </Link>
                    {meta && <p className="cv-meta">{meta}</p>}
                    {short ? (
                      <p className="cv-stock" role="status">
                        {"out" in short ? "Out of stock" : `Only ${short.left} left`}
                      </p>
                    ) : null}
                    <span className="cv-acts">
                      <button type="button" className="cv-wish" onClick={() => later(line)}>
                        Save for later
                      </button>
                      <button type="button" className="cv-wish" onClick={() => toWishlist(line)}>
                        Move to wishlist
                      </button>
                    </span>
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
                        disabled={!!short}
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

        <SavedForLater />
        <CartRecs groups={recs} />
      </div>

      <aside className="cv-sum" aria-label="Bill details">
        <h2 className="cv-sum-title">Bill details</h2>
        <FreeDelivery sub={sums.total} rules={bt.rules} />
        <dl>
          <div>
            <dt>Items total</dt>
            <dd>
              {rs(sums.total)}
            </dd>
          </div>

          <div>
            <dt>Delivery</dt>
            {bt.b ? <dd>{bt.b.ship ? rs(bt.b.ship) : "Free"}</dd> : <dd className="cv-muted">At checkout</dd>}
          </div>
          {bt.b && bt.b.tax > 0 && (
            <div>
              <dt>{gstLabel(bt.rules!.gst_inclusive, bt.b.rate)}</dt>
              <dd>{rs(bt.b.tax)}</dd>
            </div>
          )}
          {bt.b && bt.b.cess > 0 && (
            <div>
              <dt>{bt.rules!.gst_inclusive ? "Includes cess" : "Cess"}</dt>
              <dd>{rs(bt.b.cess)}</dd>
            </div>
          )}
          <div className="cv-total">
            <dt>To pay</dt>
            <dd>{rs(bt.b ? bt.b.total : sums.total)}</dd>
          </div>
        </dl>
        <PinCheck />
        {stock.blocked ? (
          <p className="cv-blocked" role="alert">
            {stock.blocked}
          </p>
        ) : null}
        <div className="cv-go">
          {payLink}
        </div>
      </aside>

      {/* phones: how to pay and the pay button stay in reach */}
      <div className="cv-bar">
        {stock.blocked ? (
          <p className="cv-blocked cv-blocked--bar" role="alert">
            {stock.blocked}
          </p>
        ) : null}
        {payLink}
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
// uses the shop's default rate. Cess (0060) only when switched on in Settings.
function useBill(cart: CartLine[], sub: number | undefined) {
  const [rules, setRules] = useState<StoreSettings | null>(null);
  const [rates, setRates] = useState<Map<string, { gst: number | null; cess: number }> | null>(null);
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
          cart.map((l) => ({ gross: lineTotal(l) ?? 0, rate: rates.get(l.slug)?.gst ?? rules.gst_rate, cess: rules.cess_enabled ? (rates.get(l.slug)?.cess ?? 0) : 0 })),
          rules.free_shipping_over != null && sub >= rules.free_shipping_over ? 0 : rules.shipping,
          rules.gst_inclusive,
        )
      : null;
  return { b, rules };
}

function CheckoutBill({ cart, sub }: { cart: CartLine[]; sub: number | undefined }) {
  const { b, rules } = useBill(cart, sub);
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
          {b.cess > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{rules!.gst_inclusive ? "Includes cess" : "Cess"}</dt>
              <dd className="tabular-nums">{rs(b.cess)}</dd>
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
    <aside className="rounded-[var(--radius)] border border-line bg-iron p-6">
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

// How far the cart is from free delivery, as a bar (Settings: free delivery
// over a total); nothing when there's no such rule
function FreeDelivery({ sub, rules }: { sub: number | undefined; rules: StoreSettings | null }) {
  const over = rules?.free_shipping_over;
  if (sub === undefined || over == null || over <= 0 || !rules?.shipping) return null;
  const left = Math.max(0, over - sub);
  return (
    <div className="cv-free" role="status">
      <p>{left > 0 ? <>Add {rs(left)} more for free delivery</> : <>Free delivery on this order</>}</p>
      <span className="cv-free-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (sub / over) * 100)}%` }} />
      </span>
    </div>
  );
}

// "Does it deliver to my pin code?" Kept in this browser. Every pin code in
// India is delivered to for now; delivery areas and times come with the
// shipping rules.
const PIN_KEY = "bj-pin";
function PinCheck() {
  const [pin, setPin] = useState("");
  const [checked, setChecked] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PIN_KEY) ?? "";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the pin saved in this browser, once
      setPin(saved);
      setChecked(saved);
    } catch {}
  }, []);
  const ok = /^[1-9][0-9]{5}$/.test(pin);
  const check = () => {
    if (!ok) return;
    setChecked(pin);
    try {
      localStorage.setItem(PIN_KEY, pin);
    } catch {}
  };
  return (
    <div className="cv-pin">
      <label>
        <span>Delivery pin code</span>
        <span className="cv-pin-row">
          <input inputMode="numeric" maxLength={6} value={pin} placeholder="e.g. 411001" onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && check()} />
          <button type="button" className="cv-link" disabled={!ok} onClick={check}>
            Check
          </button>
        </span>
      </label>
      {checked && checked === pin && <p className="cv-pin-ok">We deliver to {checked}, anywhere in India.</p>}
      {pin.length === 6 && !ok && <p className="cv-pin-bad">That isn&apos;t a pin code.</p>}
    </div>
  );
}

// Lines saved for later, under the cart: back into the cart, or gone
function SavedForLater() {
  const later = useLater();
  if (!later.length) return null;
  return (
    <section className="cv-panel cv-later" aria-labelledby="cv-later-title">
      <h2 id="cv-later-title" className="cv-later-title">
        Saved for later <span>{later.length}</span>
      </h2>
      <ul className="cv-lines">
        {later.map((line) => (
          <li key={line.key} className="cv-line">
            <Link href={line.href} className="cv-thumb" tabIndex={-1} aria-hidden="true">
              <ProductArt name={line.name} tone={line.tone} slug={line.slug} option={line.variant} />
            </Link>
            <div className="cv-info">
              <Link href={line.href} className="cv-name">
                {line.name}
              </Link>
              <p className="cv-meta">{[line.variant !== "Standard" ? line.variant : null, line.unit, `${line.qty} ×`].filter(Boolean).join(" · ")}</p>
              <span className="cv-acts">
                <button type="button" className="cv-wish" onClick={() => moveToCart(line.key)}>
                  Move to cart
                </button>
                <button type="button" className="cv-wish" onClick={() => dropLater(line.key)}>
                  Remove
                </button>
              </span>
            </div>
            <div className="cv-side">
              <p className="cv-price">
                <span>{rs(lineTotal(line))}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
