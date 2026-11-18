"use client";

import { useState } from "react";
import { RangePicker, useRange } from "@/components/admin/RangePicker";
import { errText } from "@/lib/orders-db";
import { getReceipt, listReceipts } from "@/lib/stock-in/db";
import { purchasesCsv } from "@/lib/stock-in/purchases-csv";

// Finance › GST returns and Tally: everything handed to the CA for a month,
// built from the invoices, credit notes and supplier bills (moved here from
// Analytics › Reports so all tax work sits in Finance).
function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ReturnsPage() {
  const [range, setRange] = useRange("month");
  const [making, setMaking] = useState<"" | "returns" | "registers" | "purchases">("");
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState<string[]>([]);

  async function returns(which: "returns" | "registers") {
    setMaking(which);
    setErr("");
    try {
      const m = await import("@/lib/gst-returns-load");
      const d = await m.loadReturns(range.from, range.to);
      setWarn(d.warnings);
      save(which === "returns" ? m.returnsZip(d, range.from, range.to) : m.registersZip(d, range.from, range.to), `babajee-${which === "returns" ? "gst-returns" : "tally-registers"}-${range.from}-to-${range.to}.zip`);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setMaking("");
    }
  }

  async function purchases() {
    setMaking("purchases");
    setErr("");
    try {
      const bills = (await listReceipts(range.from, range.to)).filter((r) => r.status === "posted");
      const full = [];
      for (let i = 0; i < bills.length; i += 8) full.push(...(await Promise.all(bills.slice(i, i + 8).map((b) => getReceipt(b.id)))));
      save(new Blob([purchasesCsv(full)], { type: "text/csv;charset=utf-8" }), `babajee-purchases-${range.from}-to-${range.to}.csv`);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setMaking("");
    }
  }

  return (
    <div className="anx">
      <header className="adm-pagehead">
        <h1>GST returns and Tally</h1>
        <p>Pick the month, download, and hand it to the CA. Built from the invoices, credit notes and supplier bills in the shop; check with the CA before filing.</p>
      </header>
      <div className="anx-bar">
        <RangePicker value={range} onChange={setRange} />
      </div>
      {err && <p className="adm-err">{err}</p>}
      {warn.length > 0 && (
        <section className="adm-card">
          <h2>Check before filing</h2>
          <ul className="adm-small rpt-warn">
            {warn.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>GST returns</h2>
            <p className="adm-muted adm-small">
              The GSTR-1 tables (B2B, B2CL, B2CS, credit notes, HSN summary with box lines counted as pieces, document summary) and a GSTR-3B summary with input credit from bills ticked as in GSTR-2B.
            </p>
          </div>
          <button type="button" className="adm-btn pri" disabled={!!making} onClick={() => returns("returns")}>
            {making === "returns" ? "Preparing." : "Download (zip)"}
          </button>
        </div>
      </section>
      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>Tally registers</h2>
            <p className="adm-muted adm-small">Sales register (invoices and credit notes) and purchase register (supplier bills), ready to import.</p>
          </div>
          <button type="button" className="adm-btn" disabled={!!making} onClick={() => returns("registers")}>
            {making === "registers" ? "Preparing." : "Download (zip)"}
          </button>
        </div>
      </section>
      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>Purchases</h2>
            <p className="adm-muted adm-small">
              One row per line on each posted stock entry dated in the range (supplier bills, opening stock and quick adds): supplier and GSTIN, bill number, product, quantity, price, taxable value, GST and its split, and whether the credit is claimable. Voided entries are left out.
            </p>
          </div>
          <button type="button" className="adm-btn" disabled={!!making} onClick={purchases}>
            {making === "purchases" ? "Preparing." : "Download CSV"}
          </button>
        </div>
      </section>
    </div>
  );
}
