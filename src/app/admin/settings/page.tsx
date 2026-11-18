"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { money } from "@/components/admin/ui";
import { STATES } from "@/lib/addresses";
import { bill, costOf, GST_BRACKETS, unitProfit } from "@/lib/gst";
import { errText, getCouriers, getSettings, saveCouriers, saveSettings } from "@/lib/orders-db";
import { downloadAllData } from "@/lib/export-all";

// Store rules the owner can change without a code change, one topic at a
// time (?t=): business details, payments and bank, delivery and couriers,
// GST, orders and returns, stock, data. One Save covers every topic.
const TOPICS = [
  ["business", "Business details"],
  ["payments", "Payments and bank"],
  ["delivery", "Delivery and couriers"],
  ["gst", "GST"],
  ["orders", "Orders, returns and carts"],
  ["stock", "Low stock"],
  ["data", "Data export"],
] as const;
type Topic = (typeof TOPICS)[number][0];

export default function SettingsPage() {
  const [topic, setTopicState] = useState<Topic>(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    return (TOPICS.find(([id]) => id === t)?.[0] ?? "business") as Topic;
  });
  const setTopic = (t: Topic) => {
    setTopicState(t);
    const u = new URLSearchParams(window.location.search);
    u.set("t", t);
    window.history.replaceState(null, "", `${window.location.pathname}?${u}`);
  };
  const [bank, setBank] = useState({ bank_account_name: "", bank_account_number: "", bank_ifsc: "", bank_upi_id: "" });
  const [ship, setShip] = useState("");
  const [free, setFree] = useState("");
  const [rate, setRate] = useState("18");
  const [inclusive, setInclusive] = useState(true);
  const [credit, setCredit] = useState(false);
  const [cess, setCess] = useState(false);
  const [home, setHome] = useState("");
  const [returnDays, setReturnDays] = useState("7");
  const [unpaidHours, setUnpaidHours] = useState("48");
  const [methods, setMethods] = useState("UPI, Bank transfer, Cash");
  const [lowAt, setLowAt] = useState("3");
  const [abandonHours, setAbandonHours] = useState("1");
  const [expireDays, setExpireDays] = useState("30");
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
        setCess(s.cess_enabled);
        setHome(s.store_state);
        setReturnDays(String(s.return_days));
        setUnpaidHours(String(s.unpaid_hours));
        setMethods(s.payment_methods.join(", "));
        setLowAt(String(s.low_stock_at));
        setAbandonHours(String(s.cart_abandon_hours));
        setExpireDays(String(s.cart_expire_days));
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
        setBank({ bank_account_name: s.bank_account_name, bank_account_number: s.bank_account_number, bank_ifsc: s.bank_ifsc, bank_upi_id: s.bank_upi_id });
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
    const hold = Math.round(Number(unpaidHours) || 0);
    if (hold < 0 || hold > 720) {
      setErr("Unpaid orders can be held for 0 to 720 hours (30 days).");
      return;
    }
    const abandon = Math.round(Number(abandonHours) || 0);
    const expire = Math.round(Number(expireDays) || 0);
    if (abandon < 1 || abandon > 720 || expire < 0 || expire > 365) {
      setErr("A cart is abandoned after 1 to 720 hours, and cleared after 0 (never) to 365 days.");
      return;
    }
    const payMethods = [...new Set(methods.split(",").map((m) => m.trim()).filter(Boolean))];
    if (!payMethods.length || payMethods.some((m) => m.length > 40) || payMethods.length > 8) {
      setErr("List 1 to 8 payment methods, separated by commas, each up to 40 characters.");
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
    const ifsc = bank.bank_ifsc.trim().toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      setErr("That IFSC doesn't look right: 11 characters, like HDFC0001234.");
      return;
    }
    const upi = bank.bank_upi_id.trim();
    if (upi && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi)) {
      setErr("That UPI ID doesn't look right: like babajee@okhdfcbank.");
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
        cess_enabled: cess,
        cart_abandon_hours: abandon,
        cart_expire_days: expire,
        store_state: home,
        return_days: days,
        unpaid_hours: hold,
        payment_methods: payMethods,
        low_stock_at: Math.min(10000, Math.round(Number(lowAt) || 0)),
        ...store,
        store_name: store.store_name.trim() || "Babajee",
        gstin,
        invoice_prefix: prefix,
        bank_account_name: bank.bank_account_name.trim(),
        bank_account_number: bank.bank_account_number.replace(/\s/g, ""),
        bank_ifsc: ifsc,
        bank_upi_id: upi,
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
        <p>Pick a topic, change what you need, then Save at the bottom of the screen. Save keeps changes made on every topic.</p>
      </header>
      <div className="adm-chips" role="tablist" aria-label="Settings topics" style={{ marginBottom: 16 }}>
        {TOPICS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={topic === id} className={`adm-chip ${topic === id ? "is-on" : ""}`} onClick={() => setTopic(id)}>
            {label}
          </button>
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

      <form className="adm-stack" style={{ maxWidth: 560 }} onSubmit={save} hidden={topic === "data"}>
        {topic === "business" && (
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
            <h2 id="set-store" style={{ margin: 0, scrollMarginTop: 140 }}>Business details (for invoices)</h2>
            <p className="adm-muted adm-small" style={{ margin: "-8px 0 0" }}>
              Printed on every invoice.
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
              <span className="adm-muted adm-small">Leave empty until the shop is registered: invoices then say &ldquo;Invoice&rdquo; instead of &ldquo;Tax invoice&rdquo;, with no GSTIN. Supplier bills still split their GST by state, taking the shop&apos;s state below (Maharashtra, 27) until a GSTIN is entered.</span>
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
        )}

        {topic === "delivery" && (
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
            <h2 id="set-delivery" style={{ margin: 0, scrollMarginTop: 140 }}>Shipping charges</h2>
            <label className="adm-label">
              Shipping charges per order (₹)
              <input className="adm-input" inputMode="decimal" value={ship} disabled={!loaded} onChange={(e) => setShip(e.target.value.replace(/[^\d.]/g, ""))} />
            </label>
            <label className="adm-label">
              Free delivery on orders of (₹)
              <input className="adm-input" inputMode="decimal" value={free} disabled={!loaded} placeholder="Leave empty for never" onChange={(e) => setFree(e.target.value.replace(/[^\d.]/g, ""))} />
            </label>
          </section>
        )}

        {topic === "gst" && (
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
              Input tax credit (ITC)
              <button type="button" className={`adm-switch ${credit ? "is-on" : ""}`} aria-pressed={credit} disabled={!loaded} onClick={() => setCredit(!credit)}>
                <i aria-hidden />
                {credit ? "Claim input tax credit" : "Not claiming input tax credit"}
              </button>
              <span className="adm-muted adm-small">
                {credit
                  ? "GST paid on purchases is set off against GST collected on sales, so Net GST payable is lower."
                  : "All GST collected on sales is payable. Turn this on if the shop is GST-registered and claims ITC."}{" "}
                Example at {g.rate}%: purchase price {money(500)} + GST = cost price {money(exCost)}, selling price {money(u.sale)} incl. GST: gross profit {money(u.profit)}, net profit
                after GST {money(u.kept)}.
              </span>
            </div>
  
            <div className="adm-label">
              Cess
              <button type="button" className={`adm-switch ${cess ? "is-on" : ""}`} aria-pressed={cess} disabled={!loaded} onClick={() => setCess(!cess)}>
                <i aria-hidden />
                {cess ? "Charging cess" : "No cess"}
              </button>
              <span className="adm-muted adm-small">
                {cess
                  ? "Products with a cess rate (set on each product, under Price) carry it on top of GST: on the bill, the invoice and the GST returns. Orders already placed keep what they were charged."
                  : "Off: no cess is charged anywhere, whatever is set on a product. Turn it on only if your products attract a compensation cess (ask your CA)."}
              </span>
            </div>
          </section>
        )}

        {topic === "orders" && (
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
            <h2 id="set-carts" style={{ margin: 0, scrollMarginTop: 140 }}>Carts</h2>
            <label className="adm-label">
              Hours before a cart counts as abandoned
              <input className="adm-input" inputMode="numeric" value={abandonHours} disabled={!loaded} onChange={(e) => setAbandonHours(e.target.value.replace(/\D/g, ""))} />
              <span className="adm-muted adm-small">
                A signed-in customer&apos;s cart left this long with no order shows under Orders → Carts → Abandoned, ready for a WhatsApp reminder you send yourself. Nothing is sent automatically.
              </span>
            </label>
            <label className="adm-label">
              Days before an untouched cart is cleared
              <input className="adm-input" inputMode="numeric" value={expireDays} disabled={!loaded} onChange={(e) => setExpireDays(e.target.value.replace(/\D/g, ""))} />
              <span className="adm-muted adm-small">
                {Number(expireDays) > 0
                  ? `Every night, carts nobody has changed for ${Number(expireDays)} day${Number(expireDays) === 1 ? "" : "s"} are emptied. Stock is never held by a cart, so this only tidies the list.`
                  : "0 means carts are never cleared."}
              </span>
            </label>
          </section>
        )}

        {topic === "payments" && (
          <>
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
              <h2 id="set-pay" style={{ margin: 0, scrollMarginTop: 140 }}>Payment</h2>
              <label className="adm-label">
                Ways customers can pay
                <input className="adm-input" value={methods} disabled={!loaded} maxLength={300} onChange={(e) => setMethods(e.target.value)} />
                <span className="adm-muted adm-small">Separated by commas. These are the choices in &ldquo;Mark paid&rdquo; (with Other always there), and how payments are grouped in reports.</span>
              </label>
              <label className="adm-label">
                Hours an unpaid order is held for payment
                <input className="adm-input" inputMode="numeric" value={unpaidHours} disabled={!loaded} onChange={(e) => setUnpaidHours(e.target.value.replace(/\D/g, ""))} />
                <span className="adm-muted adm-small">
                  {Number(unpaidHours) > 0
                    ? `An order not marked paid within ${Number(unpaidHours)} hour${Number(unpaidHours) === 1 ? "" : "s"} cancels itself: its items go back into stock and the customer gets the cancelled email. The order emails tell customers this deadline.`
                    : "0 means unpaid orders are never cancelled automatically: they hold their stock until you mark them paid or cancel them."}
                </span>
              </label>
            </section>
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
              <h2 style={{ margin: 0 }}>Bank and UPI</h2>
              <p className="adm-muted adm-small" style={{ margin: "-8px 0 0" }}>
                For customers who pay by bank transfer or UPI. Kept with the shop&apos;s settings; check them twice, a wrong digit sends money elsewhere.
              </p>
              <label className="adm-label">
                Account name
                <input className="adm-input" value={bank.bank_account_name} disabled={!loaded} autoComplete="off" onChange={(e) => setBank({ ...bank, bank_account_name: e.target.value })} />
              </label>
              <div className="set-two">
                <label className="adm-label">
                  Account number
                  <input className="adm-input" inputMode="numeric" value={bank.bank_account_number} disabled={!loaded} autoComplete="off" maxLength={20} onChange={(e) => setBank({ ...bank, bank_account_number: e.target.value.replace(/[^\d]/g, "") })} />
                </label>
                <label className="adm-label">
                  IFSC
                  <input className="adm-input" value={bank.bank_ifsc} disabled={!loaded} autoComplete="off" maxLength={11} spellCheck={false} onChange={(e) => setBank({ ...bank, bank_ifsc: e.target.value.toUpperCase().replace(/\s/g, "") })} />
                </label>
              </div>
              <label className="adm-label">
                UPI ID
                <input className="adm-input" value={bank.bank_upi_id} disabled={!loaded} autoComplete="off" spellCheck={false} placeholder="babajee@okhdfcbank" onChange={(e) => setBank({ ...bank, bank_upi_id: e.target.value.replace(/\s/g, "") })} />
              </label>
            </section>
          </>
        )}
        {topic === "orders" && (
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
            <h2 id="set-returns" style={{ margin: 0, scrollMarginTop: 140 }}>Returns</h2>
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
        )}

        {topic === "stock" && (
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
        )}

        {/* always in reach at the bottom of the screen */}
        <div className="adm-actions set-save">
          <button className="adm-btn pri" disabled={!loaded}>
            Save settings
          </button>
          {msg && <span className="adm-muted adm-small" style={{ alignSelf: "center" }}>{msg}</span>}
        </div>
      </form>

      {topic === "delivery" && <Couriers />}
      {topic === "data" && <DataExport />}
    </div>
  );
}

// the couriers offered when an order is shipped (0079), saved on their own
function Couriers() {
  const [list, setList] = useState<string[] | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getCouriers()
      .then((l) => {
        setList(l);
        setText((l ?? []).join(", "));
      })
      .catch(() => setList(null));
  }, []);
  const next = [...new Set(text.split(",").map((x) => x.trim()).filter(Boolean))];
  async function go() {
    if (next.length > 20 || next.some((x) => x.length > 40)) return toastError("Up to 20 couriers, each up to 40 characters.");
    setBusy(true);
    try {
      await saveCouriers(next);
      setList(next);
      toast("Couriers saved");
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  return (
    <section className="adm-card" style={{ display: "grid", gap: 12, maxWidth: 560, marginTop: 16 }}>
      <h2 style={{ margin: 0 }}>Couriers</h2>
      {list === null ? (
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          The courier list needs a database update (0079) that hasn&apos;t been applied yet. Until then, the ship form remembers the couriers typed in it.
        </p>
      ) : (
        <>
          <label className="adm-label">
            The couriers you use, separated by commas
            <input className="adm-input" value={text} disabled={list === undefined} onChange={(e) => setText(e.target.value)} placeholder="Delhivery, DTDC, Blue Dart, India Post" />
            <span className="adm-muted adm-small">Offered when an order is marked shipped. Any other name can still be typed there.</span>
          </label>
          {list && next.join(",") !== list.join(",") && (
            <button type="button" className="adm-btn pri" style={{ justifySelf: "start" }} disabled={busy} onClick={go}>
              {busy ? "Saving" : "Save couriers"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

// every table as raw CSV in one zip, for analysis (src/lib/export-all.ts)
function DataExport() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  async function go() {
    setBusy(true);
    setNote("Starting");
    try {
      await downloadAllData(setNote);
      setNote("");
      toast("Data downloaded");
    } catch (e) {
      setNote("");
      toastError(e);
    }
    setBusy(false);
  }
  return (
    <section className="adm-card" style={{ display: "grid", gap: 12, maxWidth: 560, marginTop: 16 }}>
      <h2 id="set-data" style={{ margin: 0, scrollMarginTop: 140 }}>Data export</h2>
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        Everything the shop has recorded, one CSV file per table in a zip, with a README describing every column: orders, customers, products,
        stock history, visits, searches, sign-ins and the activity log. It holds every customer&apos;s name, phone and address, so keep the file
        private. Each download is written to the activity log.
      </p>
      <button type="button" className="adm-btn" style={{ justifySelf: "start" }} disabled={busy} onClick={go}>
        {busy ? "Preparing…" : "Download all data"}
      </button>
      {note && <span className="adm-muted adm-small">{note}</span>}
    </section>
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
