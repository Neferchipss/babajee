"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { money, when } from "@/components/admin/ui";
import { toast, toastError } from "@/components/admin/Toaster";
import AroniumCarts from "@/components/admin/shells/AroniumCarts";
import { useAdminStyle } from "@/lib/admin-style";
import { adminCarts, cartConversion, errText, getSettings, markCartReminded, type AdminCart, type CartConversion } from "@/lib/orders-db";

// Signed-in customers' carts (guests' carts stay in their browser). Active:
// changed within the abandon window (Settings → Carts, 1 hour unless
// changed). Abandoned: left longer than that with no order since. Each
// abandoned cart can be followed up on WhatsApp with a message that lists
// what is in it; the shop sends it itself and ticks it as reminded (0067).
const HOUR = 60 * 60 * 1000;

const cartValue = (c: AdminCart) => c.lines.reduce((n, l) => n + (l.price ?? 0) * l.qty, 0);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "–");
const optionOf = (variant: string) => (variant && variant !== "Default" && variant !== "Standard" ? variant : "");

// a WhatsApp chat with the customer, the message already written
function whatsapp(c: AdminCart) {
  let digits = c.phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return null;
  const first = (c.full_name || "there").split(" ")[0];
  const items = c.lines.map((l) => `• ${l.qty} × ${l.name}${optionOf(l.variant) ? ` (${optionOf(l.variant)})` : ""}`).join("\n");
  const cart = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/cart/`;
  const text = `Hi ${first}, you left these in your Babajee jar:\n${items}\n\nThey're still waiting for you: ${cart}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

type Tab = "abandoned" | "active";

export default function CartsPage() {
  return useAdminStyle() === "aronium" ? <AroniumCarts /> : <CartsPageOriginal />;
}

function CartsPageOriginal() {
  const [rows, setRows] = useState<AdminCart[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("abandoned");
  const [idleHours, setIdleHours] = useState(1);
  const [days, setDays] = useState(30);
  const [conv, setConv] = useState<CartConversion | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    adminCarts().then(setRows, (e) => setErr(errText(e)));
    getSettings().then((s) => setIdleHours(s.cart_abandon_hours), () => {});
  }, []);
  useEffect(() => {
    const to = new Date();
    cartConversion(new Date(to.getTime() - days * 24 * HOUR), to).then(setConv, () => setConv(null));
  }, [days]);

  const isActive = (c: AdminCart) => now - new Date(c.updated_at).getTime() < idleHours * HOUR;
  const isAbandoned = (c: AdminCart) => !isActive(c) && (!c.last_order_at || new Date(c.last_order_at) < new Date(c.updated_at));

  async function reminded(c: AdminCart) {
    try {
      await markCartReminded(c.profile_id);
      setRows((r) => (r ?? []).map((x) => (x.profile_id === c.profile_id ? { ...x, reminded_at: new Date().toISOString(), reminders: x.reminders + 1 } : x)));
      toast(`Marked ${c.full_name || c.email} as reminded`);
    } catch (x) {
      toastError(x);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const abandoned = useMemo(() => (rows ?? []).filter(isAbandoned), [rows, idleHours]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const active = useMemo(() => (rows ?? []).filter(isActive), [rows, idleHours]);
  const shown = tab === "abandoned" ? abandoned : active;
  const worth = abandoned.reduce((n, c) => n + cartValue(c), 0);

  return (
    <div>
      <Link href="/admin/orders" className="adm-back adm-only-narrow">
        ← Orders
      </Link>
      <header className="adm-pagehead">
        <h1>Carts</h1>
        <p>
        Carts of signed-in customers. A cart counts as abandoned when it has been left for over {idleHours === 1 ? "an hour" : `${idleHours} hours`} without an
        order (change it in <Link href="/admin/settings#set-carts">Settings → Carts</Link>). Guests&apos; carts stay in their own browser, so they are not listed.
        Reminders are sent by you on WhatsApp; the site never sends anything.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <section className="adm-card cart-conv" aria-label="Cart to order">
        <div className="cart-conv-head">
          <h2>Cart to order</h2>
          <select className="adm-input" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Over">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        {conv ? (
          <div className="cart-conv-row">
            <div><b>{conv.visits}</b><span>visits</span></div>
            <div><b>{conv.carted}</b><span>added to cart · {pct(conv.carted, conv.visits)}</span></div>
            <div><b>{conv.checkout}</b><span>reached checkout · {pct(conv.checkout, conv.carted)}</span></div>
            <div><b>{conv.carted_ordered}</b><span>ordered · {pct(conv.carted_ordered, conv.carted)} of carts</span></div>
            <div><b>{pct(conv.accounts_ordered, conv.accounts_carted)}</b><span>of signed-in carts ordered ({conv.accounts_ordered} of {conv.accounts_carted})</span></div>
          </div>
        ) : (
          <p className="adm-muted adm-small">Counting needs the cart rules update (0067).</p>
        )}
      </section>

      <div className="adm-chips" role="tablist" style={{ marginBottom: 12 }}>
        <button type="button" role="tab" aria-selected={tab === "abandoned"} className={`adm-chip ${tab === "abandoned" ? "is-on" : ""}`} onClick={() => setTab("abandoned")}>
          Abandoned {abandoned.length > 0 && <b>{abandoned.length}</b>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "active"} className={`adm-chip ${tab === "active" ? "is-on" : ""}`} onClick={() => setTab("active")}>
          Active now {active.length > 0 && <b>{active.length}</b>}
        </button>
      </div>

      {tab === "abandoned" && abandoned.length > 0 && (
        <p className="adm-small" style={{ margin: "0 0 12px" }}>
          {abandoned.length} cart{abandoned.length === 1 ? "" : "s"} worth <strong>{money(worth)}</strong> left without an order.
        </p>
      )}

      <div className="adm-card adm-tablecard">
        {rows === null && !err ? (
          <p className="adm-empty">Loading.</p>
        ) : shown.length === 0 ? (
          <p className="adm-empty">
            {tab === "abandoned"
              ? `No abandoned carts.${active.length ? ` ${active.length} ${active.length === 1 ? "cart is" : "carts are"} active right now.` : ""}`
              : `No one is shopping right now.${abandoned.length ? ` ${abandoned.length} abandoned ${abandoned.length === 1 ? "cart" : "carts"} to follow up.` : ""}`}
          </p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>In the cart</th>
                <th className="num">Value</th>
                <th data-hide-sm>Last change</th>
                {tab === "abandoned" && <th aria-label="Follow up" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const wa = whatsapp(c);
                return (
                  <tr key={c.profile_id}>
                    <td>
                      <Link href={`/admin/customers/view?id=${c.profile_id}`} className="row-link">
                        {c.full_name || c.email}
                      </Link>
                      <div className="adm-muted adm-small">{c.phone || c.email}</div>
                    </td>
                    <td className="adm-small">
                      {c.lines.map((l) => (
                        <div key={l.key}>
                          {l.qty} × {l.name}
                          {optionOf(l.variant) ? <span className="adm-muted"> · {optionOf(l.variant)}</span> : null}
                        </div>
                      ))}
                    </td>
                    <td className="num">{money(cartValue(c))}</td>
                    <td className="adm-muted adm-small" data-hide-sm>
                      {when(c.updated_at)}
                    </td>
                    {tab === "abandoned" && (
                      <td>
                        <div className="cart-remind">
                          {wa ? (
                            <a className="adm-btn" href={wa} target="_blank" rel="noreferrer">
                              Remind on WhatsApp
                            </a>
                          ) : (
                            <span className="adm-muted adm-small">No phone number</span>
                          )}
                          <button type="button" className="adm-btn" onClick={() => reminded(c)}>
                            Mark reminded
                          </button>
                          {c.reminded_at && (
                            <span className="adm-muted adm-small">
                              Reminded {c.reminders > 1 ? `${c.reminders}× · last ` : ""}
                              {when(c.reminded_at)}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
