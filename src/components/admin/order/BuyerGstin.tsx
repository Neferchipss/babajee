"use client";

import { useState } from "react";
import { type Order } from "@/lib/orders-db";

// The buyer's GSTIN for a business (B2B) sale: printed on the invoice and
// reported in GSTR-1. It can change only until the invoice is issued.
export function BuyerGstin({ o, busy, onSave }: { o: Order; busy: boolean; onSave: (gstin: string) => void }) {
  const [g, setG] = useState(o.buyer_gstin ?? "");
  const clean = g.trim().toUpperCase();
  const ok = clean === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(clean);
  const locked = !!o.invoice_number;
  return (
    <>
      <h3 className="ov-h3">Buyer&apos;s GSTIN (B2B)</h3>
      {locked ? (
        <p className="adm-small ov-addr">
          <span>{o.buyer_gstin || "None: a consumer (B2C) sale"}</span>
          <span className="adm-muted">Locked: invoice {o.invoice_number} is issued.</span>
        </p>
      ) : (
        <div className="ov-reach">
          <input className="adm-input" maxLength={15} placeholder="Only for a business buyer" aria-label="Buyer's GSTIN" aria-invalid={!ok} value={g} onChange={(e) => setG(e.target.value.toUpperCase())} />
          <button type="button" className="adm-btn" disabled={busy || !ok || clean === (o.buyer_gstin ?? "")} onClick={() => onSave(clean)}>
            Save
          </button>
        </div>
      )}
      {!locked && <p className="adm-muted adm-small">Enter it before the order is paid: the invoice is issued on payment, and the GSTIN can&apos;t change after that.</p>}
      {!ok && <p className="adm-err">That GSTIN doesn&apos;t look right: it&apos;s 15 characters, like 27ABCDE1234F1Z5.</p>}
    </>
  );
}
