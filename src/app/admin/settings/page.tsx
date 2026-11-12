"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { money } from "@/components/admin/ui";
import { STATES } from "@/lib/addresses";
import { bill, costOf, GST_BRACKETS, unitProfit } from "@/lib/gst";
import { errText, getSettings, saveSettings } from "@/lib/orders-db";

// Store rules the owner can change without a code change: the delivery charge,
// the order value above which delivery is free, and GST.
// (Bank details for payment come later, with the payment step.)
export default function SettingsPage() {
  const [ship, setShip] = useState("");
  const [free, setFree] = useState("");
  const [rate, setRate] = useState("18");
  const [inclusive, setInclusive] = useState(true);
  const [credit, setCredit] = useState(false);
  const [home, setHome] = useState("");
  const [returnDays, setReturnDays] = useState("7");
  const [lowAt, setLowAt] = useState("3");
  // the shop's own details, for invoices
  const [store, setStore] = useState({ store_name: "Babajee", legal_name: "", gstin: "", store_address: "", store_phone: "", store_email: "", invoice_prefix: "BJ", invoice_note: "" });
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setShip(String(s.shipping));
        setFree(s.free_shipping_over == null ? "" : String(s.free_shipping_over));
        setRate(String(s.gst_rate));
        setInclusive(s.gst_inclusive);
        setCredit(s.gst_input_credit);
        setHome(s.store_state);
        setReturnDays(String(s.return_days));
        setLowAt(String(s.low_stock_at));
        setStore({
          store_name: s.store_name,
          legal_name: s.legal_name,
          gstin: s.gstin,
          store_address: s.store_address,
          store_phone: s.store_phone,
          store_email: s.store_email,
          invoice_prefix: s.invoice_prefix,
          invoice_note: s.invoice_note,
        });
        setLoaded(true);
      })
      .catch((e) => setErr(errText(e)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const days = Math.round(Number(returnDays) || 0);
    if (days < 0 || days > 90) {
      setErr("Returns can be open for 0 to 90 days.");
      return;
    }
    const gstin = store.gstin.trim().toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      setErr("That GSTIN doesn't look right: it's 15 characters, like 27ABCDE1234F1Z5.");
      return;
    }
    const prefix = store.invoice_prefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,5}$/.test(prefix)) {
      setErr("The invoice prefix is 1 to 5 letters or numbers, like BJ.");
      return;
    }
    const r = Number(rate);
    if (!(r >= 0 && r <= 40)) {
      setErr("GST rate must be between 0 and 40%.");
      return;
    }
    try {
      await saveSettings({
        shipping: Number(ship) || 0,
        free_shipping_over: free.trim() === "" ? null : Number(free),
        gst_rate: r,
        gst_inclusive: inclusive,
        gst_input_credit: credit,
        store_state: home,
        return_days: days,
        low_stock_at: Math.min(10000, Math.round(Number(lowAt) || 0)),
        ...store,
        store_name: store.store_name.trim() || "Babajee",
        gstin,
        invoice_prefix: prefix,
      });
      setMsg("Saved. New orders use these from now on.");
      toast("Settings saved");
    } catch (x) {
      setErr(errText(x));
      toastError(x);
    }
  }

  // a worked example with the rule as it stands on screen
  const g = { rate: Number(rate) || 0, inclusive, credit };
  const ex = bill([{ gross: 1000, rate: g.rate }], 0, inclusive);
  const exCost = costOf(500, g.rate);
  const u = unitProfit(1000, exCost, g);

  return (
    <div>
      <h1 className="sr-only">Settings</h1>
      {err && <p className="adm-err">{err}</p>}

      <header className="adm-pagehead">
        <h1>Store settings</h1>
        <p>The shop&apos;s details, delivery, GST and rules. Change what you need, then Save at the bottom of the screen.</p>
      </header>
      {/* jump to a section */}
      <div className="adm-chips" style={{ marginBottom: 16 }}>
        {[
          ["store", "Store details"],
          ["delivery", "Delivery"],
          ["gst", "GST"],
          ["returns", "Returns"],
          ["stock", "Low stock"],
        ].map(([id, label]) => (
          <a key={id} href={`#set-${id}`} className="adm-chip">
            {label}
          </a>
        ))}
      </div>
      {/* who can use the admin, and everything they changed (phones: the sidebar has them) */}
      <div className="adm-chips adm-only-narrow" style={{ marginBottom: 16 }}>
        <Link href="/admin/settings/team" className="adm-chip">
          Admins →
        </Link>
        <Link href="/admin/settings/activity" className="adm-chip">
          Activity log →
        </Link>
      </div>

      <form className="adm-stack" style={{ maxWidth: 560 }} onSubmit={save}>
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
          <h2 id="set-store" style={{ margin: 0, scrollMarginTop: 140 }}>Store details</h2>
          <p className="adm-muted adm-small" style={{ margin: "-8px 0 0" }}>
            Printed on every invoice and packing slip.
          </p>
          <label className="adm-label">
            Shop name
            <input className="adm-input" value={store.store_name} disabled={!loaded} onChange={(e) => setStore({ ...store, store_name: e.target.value })} />
          </label>
          <label className="adm-label">
            Legal name, as registered for GST
            <input className="adm-input" value={store.legal_name} disabled={!loaded} placeholder="The business's registered name" onChange={(e) => setStore({ ...store, legal_name: e.target.value })} />
          </label>
          <label className="adm-label">
            GSTIN
            <input
              className="adm-input"
              value={store.gstin}
              disabled={!loaded}
              placeholder="27ABCDE1234F1Z5"
              maxLength={15}
              spellCheck={false}
              onChange={(e) => setStore({ ...store, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })}
            />
            <span className="adm-muted adm-small">Leave empty until the shop is registered: invoices then say &ldquo;Invoice&rdquo; instead of &ldquo;Tax invoice&rdquo;, with no GSTIN.</span>
          </label>
          <label className="adm-label">
            Address
            <textarea className="adm-input" rows={3} value={store.store_address} disabled={!loaded} placeholder={"Shop no., building, street\nArea, city, pincode"} onChange={(e) => setStore({ ...store, store_address: e.target.value })} />
          </label>
          <div className="set-two">
            <label className="adm-label">
              Phone
              <input className="adm-input" type="tel" value={store.store_phone} disabled={!loaded} onChange={(e) => setStore({ ...store, store_phone: e.target.value })} />
            </label>
            <label className="adm-label">
              Email
              <input className="adm-input" type="email" value={store.store_email} disabled={!loaded} onChange={(e) => setStore({ ...store, store_email: e.target.value })} />
            </label>
          </div>
          <div className="set-two">
            <label className="adm-label">
              Invoice number prefix
              <input className="adm-input" value={store.invoice_prefix} disabled={!loaded} maxLength={5} onChange={(e) => setStore({ ...store, invoice_prefix: e.target.value.toUpperCase() })} />
              <span className="adm-muted adm-small">Numbers run {store.invoice_prefix || "BJ"}/26-27/0001, 0002… and start again each April.</span>
            </label>
            <label className="adm-label">
              Line at the bottom
              <input className="adm-input" value={store.invoice_note} disabled={!loaded} onChange={(e) => setStore({ ...store, invoice_note: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
          <h2 id="set-delivery" style={{ margin: 0, scrollMarginTop: 140 }}>Delivery charges</h2>
          <label className="adm-label">
            Delivery charge per order (₹)
            <input className="adm-input" inputMode="decimal" value={ship} disabled={!loaded} onChange={(e) => setShip(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="adm-label">
            Free delivery on orders of (₹)
            <input className="adm-input" inputMode="decimal" value={free} disabled={!loaded} placeholder="Leave empty for never" onChange={(e) => setFree(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
        </section>

        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
          <h2 id="set-gst" style={{ margin: 0, scrollMarginTop: 140 }}>GST</h2>
          <label className="adm-label">
            Default GST bracket
            <select className="adm-input" value={rate} disabled={!loaded} onChange={(e) => setRate(e.target.value)}>
              {!(GST_BRACKETS as readonly number[]).includes(Number(rate)) && <option value={rate}>{rate}%</option>}
              {GST_BRACKETS.map((b) => (
                <option key={b} value={String(b)}>
                  {b}%
                </option>
              ))}
            </select>
            <span className="adm-muted adm-small">For products that don&apos;t have their own bracket. Set each product&apos;s bracket on the product, under Cost and profit.</span>
          </label>

          <label className="adm-label">
            State the shop is registered in
            <select className="adm-input" value={home} disabled={!loaded} onChange={(e) => setHome(e.target.value)}>
              <option value="">Not set</option>
              {STATES.map((st) => (
                <option key={st}>{st}</option>
              ))}
            </select>
            <span className="adm-muted adm-small">Sales inside this state split into CGST and SGST in the GST report. Sales to other states are IGST.</span>
          </label>

          <div className="adm-label">
            Shelf prices
            <div className="adm-seg" role="group" aria-label="Shelf prices">
              <button type="button" className={inclusive ? "is-on" : ""} aria-pressed={inclusive} disabled={!loaded} onClick={() => setInclusive(true)}>
                Include GST
              </button>
              <button type="button" className={!inclusive ? "is-on" : ""} aria-pressed={!inclusive} disabled={!loaded} onClick={() => setInclusive(false)}>
                GST added at checkout
              </button>
            </div>
            <span className="adm-muted adm-small">
              A {money(1000)} cart: {inclusive ? `the customer pays ${money(ex.total)}, of which ${money(ex.tax)} is GST.` : `GST of ${money(ex.tax)} is added, so the customer pays ${money(ex.total)}.`}
            </span>
          </div>

          <div className="adm-label">
            GST on supplier bills
            <button type="button" className={`adm-switch ${credit ? "is-on" : ""}`} aria-pressed={credit} disabled={!loaded} onClick={() => setCredit(!credit)}>
              <i aria-hidden />
              {credit ? "Claimed back (input tax credit)" : "Not claimed back"}
            </button>
            <span className="adm-muted adm-small">
              {credit
                ? "The GST inside each cost price is set against the GST collected, so Analytics shows less GST left to pay."
                : "All GST collected is owed. Turn this on if the shop is GST-registered and claims input tax credit."}{" "}
              Example at {g.rate}%: bought for {money(500)} + GST = cost price {money(exCost)}, sold for {money(u.sale)} with GST: profit {money(u.profit)}. After paying the
              GST, {money(u.kept)} is left.
            </span>
          </div>
        </section>

        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
          <h2 id="set-returns" style={{ margin: 0, scrollMarginTop: 140 }}>Cancellations and returns</h2>
          <label className="adm-label">
            Days after delivery a customer can ask for a return
            <input className="adm-input" inputMode="numeric" value={returnDays} disabled={!loaded} onChange={(e) => setReturnDays(e.target.value.replace(/\D/g, ""))} />
            <span className="adm-muted adm-small">
              {Number(returnDays) > 0
                ? `Customers see "Ask for a return" on a delivered order for ${Number(returnDays)} day${Number(returnDays) === 1 ? "" : "s"}. You accept or decline each request.`
                : "0 means no returns: the button doesn't show."}{" "}
              Unpaid orders can always be cancelled by the customer; a paid one sends you a cancellation request.
            </span>
          </label>
        </section>

        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
          <h2 id="set-stock" style={{ margin: 0, scrollMarginTop: 140 }}>Low stock</h2>
          <label className="adm-label">
            An option is low at this many or fewer left
            <input className="adm-input" inputMode="numeric" value={lowAt} disabled={!loaded} onChange={(e) => setLowAt(e.target.value.replace(/\D/g, ""))} />
            <span className="adm-muted adm-small">
              For products that count stock. The admin shows an alert, and a notification while it&apos;s open, when an option reaches it. A product can set its own number on its page, like 10 for papers that sell fast.
            </span>
          </label>
          <NotifyToggle />
        </section>

        {/* always in reach at the bottom of the screen */}
        <div className="adm-actions set-save">
          <button className="adm-btn pri" disabled={!loaded}>
            Save settings
          </button>
          {msg && <span className="adm-muted adm-small" style={{ alignSelf: "center" }}>{msg}</span>}
        </div>
      </form>
    </div>
  );
}


// Browser notifications for low stock, in this browser, while the admin is open.
function NotifyToggle() {
  const [state, setState] = useState<string>(() => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"));
  if (state === "unsupported") return <p className="adm-muted adm-small" style={{ margin: 0 }}>This browser can&apos;t show notifications; alerts show inside the admin.</p>;
  if (state === "granted") return <p className="adm-muted adm-small" style={{ margin: 0 }}>Notifications are on in this browser.</p>;
  if (state === "denied") return <p className="adm-muted adm-small" style={{ margin: 0 }}>Notifications are blocked for this site in the browser&apos;s settings; alerts still show inside the admin.</p>;
  return (
    <button type="button" className="adm-btn" style={{ justifySelf: "start" }} onClick={() => Notification.requestPermission().then(setState)}>
      Notify me in this browser
    </button>
  );
}
