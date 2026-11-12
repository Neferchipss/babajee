"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProductPicker, Stepper, type Pick } from "@/components/admin/OrderForms";
import { toast, toastError } from "@/components/admin/Toaster";
import { money } from "@/components/admin/ui";
import { STATES } from "@/lib/addresses";
import { bill, gstLabel } from "@/lib/gst";
import { createOrder, customerAddresses, errText, getSettings, listCustomers, type Customer, type CustomerAddress, type StoreSettings } from "@/lib/orders-db";

// An order the shop takes itself: by phone, on WhatsApp, at the counter.
// Pick (or type) the customer, add items, and it lands in Orders like any
// other, unpaid or already paid.
type Line = Pick & { qty: number; typed: string };
type Addr = { line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; latitude: number | null; longitude: number | null };
const NO_ADDR: Addr = { line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", latitude: null, longitude: null };

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function NewOrderPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [ship, setShip] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [who, setWho] = useState<Customer | null>(null);
  const [find, setFind] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [saved, setSaved] = useState<CustomerAddress[]>([]);
  const [addr, setAddr] = useState<Addr>(NO_ADDR);
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e) => setErr(errText(e)));
  }, []);


  useEffect(() => {
    if (!find || customers) return;
    listCustomers()
      .then(setCustomers)
      .catch((e) => setErr(errText(e)));
  }, [find, customers]);

  const matches = useMemo(() => {
    const w = find.trim().toLowerCase();
    const d = w.replace(/\D/g, "");
    if (!w || !customers) return [];
    return customers
      .filter((c) => `${c.full_name} ${c.email}`.toLowerCase().includes(w) || (d.length >= 3 && c.phone.replace(/\D/g, "").includes(d)))
      .slice(0, 6);
  }, [find, customers]);

  function pickCustomer(c: Customer) {
    setWho(c);
    setFind("");
    setContact({ name: c.full_name, phone: c.phone, email: c.email });
    customerAddresses(c.id)
      .then((as) => {
        setSaved(as);
        if (as[0]) applyAddress(as[0]);
      })
      .catch(() => setSaved([]));
  }

  function applyAddress(a: CustomerAddress) {
    setAddr({ line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode, latitude: a.latitude, longitude: a.longitude });
    if (a.recipient_name || a.phone) setContact((c) => ({ ...c, name: a.recipient_name || c.name, phone: a.phone || c.phone }));
  }

  // from a customer's page (?customer=id): that customer, already picked
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("customer");
    if (!id) return;
    listCustomers()
      .then((all) => {
        setCustomers(all);
        const c = all.find((x) => x.id === id);
        if (c) pickCustomer(c);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearCustomer() {
    setWho(null);
    setSaved([]);
    setContact({ name: "", phone: "", email: "" });
    setAddr(NO_ADDR);
  }

  function add(p: Pick) {
    setLines((ls) => {
      const same = ls.find((l) => l.variant === p.variant);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [...ls, { ...p, qty: 1, typed: p.price > 0 ? "" : "" }];
    });
  }

  const priceOf = (l: Line) => (l.typed.trim() !== "" ? Number(l.typed) : l.price);
  const live = lines.filter((l) => l.qty > 0);
  const sub = r2(live.reduce((n, l) => n + priceOf(l) * l.qty, 0));
  const autoShip = settings ? (settings.free_shipping_over != null && sub >= settings.free_shipping_over ? 0 : settings.shipping) : 0;
  const shipping = ship == null ? autoShip : Number(ship) || 0;
  const total = settings ? bill(live.map((l) => ({ gross: priceOf(l) * l.qty, rate: l.gst ?? settings.gst_rate })), shipping, settings.gst_inclusive) : null;

  const problem = !live.length
    ? "Add at least one item."
    : live.some((l) => !(priceOf(l) > 0))
      ? "Type a price for every item without one."
      : !contact.name.trim() || !contact.phone.trim()
        ? "Add the customer's name and phone number."
        : !addr.line1.trim() || !addr.city.trim() || !addr.state || !addr.pincode.trim()
          ? "Add a full delivery address."
          : "";

  async function create() {
    if (problem || !settings) return;
    setBusy(true);
    setErr("");
    try {
      const o = await createOrder({
        customer: who?.id ?? null,
        contact,
        address: addr,
        lines: live.map((l) => ({ variant: l.variant, qty: l.qty, ...(l.typed.trim() !== "" ? { price: Number(l.typed) } : {}) })),
        shipping: ship == null ? null : shipping,
        notes,
        paid,
      });
      toast(`Order ${o.number} created${paid ? " as paid" : ""}`);
      router.push(`/admin/orders/view?id=${o.id}`);
    } catch (e) {
      setErr(errText(e));
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <div className="ov">
      <Link href="/admin/orders" className="adm-back">
        ← Orders
      </Link>

      <section className="adm-card ov-hero no-new">
        <div className="ov-top">
          <div className="ov-title">
            <h1>New order</h1>
            <p className="ov-next">For a sale taken by phone, on WhatsApp or at the counter.</p>
          </div>
          <div className="ov-total">
            <span>Total</span>
            <b>{money(total?.total ?? 0)}</b>
            <small>{((n) => `${n} item${n === 1 ? "" : "s"}`)(live.reduce((n, l) => n + l.qty, 0))}</small>
          </div>
        </div>
        <div className="ov-actions">
          <label className="adm-check">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            Payment already received
          </label>
          <span className="ov-gap" />
          {problem && (live.length > 0 || contact.name) && <span className="adm-muted adm-small">{problem}</span>}
          <button type="button" className="adm-btn pri ov-go" disabled={busy || !!problem || !settings} onClick={create}>
            {busy ? "Creating" : `Create order${total?.total ? ` · ${money(total.total)}` : ""}`}
          </button>
        </div>
      </section>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-two">
        <div className="adm-stack">
          <section className="adm-card">
            <h2>Items</h2>
            <ProductPicker onPick={add} unpriced placeholder="Find a product by name" />
            {lines.length > 0 && (
              <ul className="ov-items no-items">
                {lines.map((l) => (
                  <li key={l.variant} className={l.qty === 0 ? "is-back" : ""}>
                    <Stepper label={l.name} value={l.qty} max={l.stock ?? 99} onChange={(n) => setLines((ls) => ls.map((x) => (x === l ? { ...x, qty: n } : x)))} />
                    <span className="ov-name">
                      <strong>{l.name}</strong>
                      {l.label && <span className="adm-muted"> · {l.label}</span>}
                      <span className="adm-muted adm-small ov-sub">
                        {l.stock != null && `${l.stock} in stock · `}
                        {l.qty === 0 ? "will be left off" : l.price > 0 ? `${money(l.price)} on the shelf` : "no shelf price"}
                      </span>
                    </span>
                    <label className="no-price">
                      <span className="sr-only">Price each for {l.name}</span>₹
                      <input
                        className="adm-input"
                        inputMode="decimal"
                        value={l.typed}
                        placeholder={l.price > 0 ? String(l.price) : "Price"}
                        onChange={(e) => setLines((ls) => ls.map((x) => (x === l ? { ...x, typed: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {lines.length === 0 && <p className="adm-muted adm-small" style={{ margin: "12px 0 0" }}>Search above to add products. The shelf price is used unless you type another.</p>}

            <div className="adm-kv ov-sum">
              <span>Subtotal</span>
              <span>{money(sub)}</span>
              <span>Delivery</span>
              <span>
                <input
                  className="adm-input no-ship"
                  inputMode="decimal"
                  aria-label="Delivery charge"
                  value={ship ?? String(autoShip)}
                  onChange={(e) => setShip(e.target.value.replace(/[^\d.]/g, ""))}
                />
              </span>
              {total && total.tax > 0 && (
                <>
                  <span>{gstLabel(!!settings?.gst_inclusive, total.rate)}</span>
                  <span>{money(total.tax)}</span>
                </>
              )}
              <span className="tot">Total</span>
              <span className="tot">{money(total?.total ?? 0)}</span>
            </div>
            {ship == null && settings?.free_shipping_over != null && (
              <p className="adm-muted adm-small" style={{ margin: "8px 0 0" }}>
                Delivery follows Settings: free on {money(settings.free_shipping_over)} or more. Type to change it for this order.
              </p>
            )}
          </section>

          <section className="adm-card">
            <h2>Notes</h2>
            <textarea className="adm-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember: how they paid, when to deliver…" aria-label="Order notes" />
          </section>
        </div>

        <div className="adm-stack">
          <section className="adm-card">
            <h2>Customer</h2>
            {who ? (
              <div className="no-who">
                <span>
                  <strong>{who.full_name || who.email}</strong>
                  <span className="adm-muted adm-small ov-sub">
                    {who.orders} earlier order{who.orders === 1 ? "" : "s"}
                  </span>
                </span>
                <button type="button" className="adm-link" onClick={clearCustomer}>
                  Change
                </button>
              </div>
            ) : (
              <div className="ofm-find">
                <input className="adm-input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a customer: name, phone or email" aria-label="Find a customer" />
                {find.trim() && (
                  <ul>
                    {!customers ? (
                      <li className="adm-muted adm-small">Loading customers…</li>
                    ) : matches.length === 0 ? (
                      <li className="adm-muted adm-small">No customer matches. Fill in the details below for a new one.</li>
                    ) : (
                      matches.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => pickCustomer(c)}>
                            <span>{c.full_name || c.email}</span>
                            <span className="adm-muted adm-small">{c.phone || c.email}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
                <p className="adm-muted adm-small" style={{ margin: "8px 0 0" }}>
                  Or fill in the details for someone without an account.
                </p>
              </div>
            )}

            <div className="ofm-who no-fields">
              <label className="adm-label wide">
                Name
                <input className="adm-input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              </label>
              <label className="adm-label">
                Phone
                <input className="adm-input" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </label>
              <label className="adm-label">
                Email (optional)
                <input className="adm-input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </label>
            </div>

            <h3 className="ov-h3">Deliver to</h3>
            {saved.length > 0 && (
              <div className="adm-chips no-saved" role="group" aria-label="Saved addresses">
                {saved.map((a) => (
                  <button key={a.id} type="button" className={`adm-chip ${addr.line1 === a.line1 && addr.pincode === a.pincode ? "is-on" : ""}`} onClick={() => applyAddress(a)}>
                    {a.label || "Address"} · {a.city}
                  </button>
                ))}
              </div>
            )}
            <div className="ofm-who">
              <label className="adm-label wide">
                Address
                <input className="adm-input" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value, latitude: null, longitude: null })} />
              </label>
              <label className="adm-label wide">
                Area, street (optional)
                <input className="adm-input" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
              </label>
              <label className="adm-label wide">
                Landmark (optional)
                <input className="adm-input" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} />
              </label>
              <label className="adm-label">
                City
                <input className="adm-input" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              </label>
              <label className="adm-label">
                Pincode
                <input className="adm-input" inputMode="numeric" value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value, latitude: null, longitude: null })} />
              </label>
              <label className="adm-label wide">
                State
                <select className="adm-input" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })}>
                  <option value="">Pick a state</option>
                  {STATES.map((st) => (
                    <option key={st}>{st}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
