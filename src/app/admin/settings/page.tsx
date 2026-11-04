"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { money } from "@/components/admin/ui";
import { STATES } from "@/lib/addresses";
import { bill, unitProfit } from "@/lib/gst";
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
  const ex = bill(1000, 0, g);
  const u = unitProfit(1000, 600, g);

  return (
    <div>
      <h1 className="sr-only">Settings</h1>
      {err && <p className="adm-err">{err}</p>}

      <form className="adm-stack" style={{ maxWidth: 560 }} onSubmit={save}>
        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
          <h2 style={{ margin: 0 }}>Delivery charges</h2>
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
          <h2 style={{ margin: 0 }}>GST</h2>
          <label className="adm-label">
            GST rate on the cart (%)
            <input className="adm-input" inputMode="decimal" value={rate} disabled={!loaded} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} />
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
                ? "Cost prices are taken as including GST at the same rate. That GST is taken off the cost and set against the GST collected, so Analytics shows the GST left to pay."
                : "Cost prices count in full, and all GST collected is owed. Turn this on if the shop is GST-registered and claims input tax credit."}{" "}
              Example: an item sold at {money(1000)} that cost {money(600)} makes {money(u.profit)} ({u.margin.toFixed(1)}% margin).
            </span>
          </div>
        </section>

        <section className="adm-card" style={{ display: "grid", gap: 16 }}>
          <h2 style={{ margin: 0 }}>Cancellations and returns</h2>
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

        <div className="adm-actions">
          <button className="adm-btn pri" disabled={!loaded}>
            Save
          </button>
          {msg && <span className="adm-muted adm-small" style={{ alignSelf: "center" }}>{msg}</span>}
        </div>
      </form>
    </div>
  );
}
