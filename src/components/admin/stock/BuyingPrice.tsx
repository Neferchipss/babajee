"use client";

import { useState } from "react";
import { Dialog } from "@/components/admin/ui";
import type { AdminVariant } from "@/lib/admin-data";
import { errText, type Purchase } from "@/lib/orders-db";

// Setting or correcting an option's buying price (Inventory > Stock): per
// piece before GST, with the GST rate on the supplier's bill. A counted
// option's price is the average of its bills, so changing it is a correction
// with a reason, kept in the activity log (0057).
export default function BuyingPrice({ variant, have, rate, onClose, onSaved }: { variant: AdminVariant | null; have?: Purchase; rate: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const counted = !!variant?.track_stock;
  const [price, setPrice] = useState(have?.purchase != null ? String(have.purchase) : "");
  const [gst, setGst] = useState(String(have?.gstPaid != null && have.purchase ? Math.round((have.gstPaid / have.purchase) * 1000) / 10 : rate));
  const [why, setWhy] = useState(have?.purchase == null ? "Opening stock" : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!variant) return;
    const n = Number(price);
    const r = Number(gst);
    if (!(price.trim() !== "" && n >= 0)) return setErr("Enter the buying price before GST.");
    if (!(r >= 0 && r <= 100)) return setErr("Enter the GST rate on the bill.");
    if (counted && why.trim().length < 3) return setErr("Say why, for the activity log.");
    setBusy(true);
    setErr("");
    try {
      const m = await import("@/lib/orders-db");
      if (counted) await m.correctPurchase(variant.id, n, r, why.trim());
      else await m.setPurchase(variant.id, n, { rate: r, amount: null });
      await onSaved();
    } catch (x) {
      setErr(errText(x));
    }
    setBusy(false);
  }
  return (
    <Dialog open={!!variant} onClose={onClose}>
      {variant && (
        <form className="prd-dialog" onSubmit={save}>
          <h2>Buying price · {variant.label}</h2>
          <p className="adm-muted adm-small">
            {counted ? "Its stock is counted, so this corrects the average from the bills. Bills added later average against it; the old price and your reason go in the activity log." : "Per piece, before GST."}
          </p>
          <label className="adm-label">
            Price before GST (₹)
            <input className="adm-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="adm-label">
            GST % on the supplier&apos;s bill
            <input className="adm-input" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          {counted && (
            <label className="adm-label">
              Why
              <input className="adm-input" value={why} maxLength={300} placeholder="e.g. opening count entered at the wrong price" onChange={(e) => setWhy(e.target.value)} />
            </label>
          )}
          {err && <p className="adm-err">{err}</p>}
          <div className="adm-actions">
            <button type="button" className="adm-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="adm-btn pri" disabled={busy}>
              {busy ? "Saving" : "Save"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

