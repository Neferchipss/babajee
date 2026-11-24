"use client";

import { useState } from "react";
import { useRange } from "@/components/admin/RangePicker";
import { isoDay } from "@/lib/dates";
import { errText } from "@/lib/orders-db";
import { getReceipt, listReceipts } from "@/lib/stock-in/db";
import { purchasesCsv } from "@/lib/stock-in/purchases-csv";
import { ArIcon, ArScreen } from "./aronium-kit";
import { ArHelp, ArInfo } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Tax rates • Tax returns, laid out as Aronium's Reporting: the
// list of what can be made on the left ("Select report to view or print"),
// the Filter panel on the right with the period and the buttons. Everything
// handed to the CA for a month, built from the invoices, credit notes and
// supplier bills: the GST returns (GSTR-1 tables and a GSTR-3B summary), the
// Tally registers, and the purchases sheet.
type Kind = "returns" | "registers" | "purchases";
const LIST: { id: Kind; group: string; label: string; about: string; file: string }[] = [
  {
    id: "returns",
    group: "GST",
    label: "GST returns",
    about: "The GSTR-1 tables (B2B, B2CL, B2CS, credit notes, HSN summary with box lines counted as pieces, document summary) and a GSTR-3B summary with input credit from bills ticked as in GSTR-2B.",
    file: "zip",
  },
  { id: "registers", group: "Tally", label: "Tally registers", about: "Sales register (invoices and credit notes) and purchase register (supplier bills), ready to import.", file: "zip" },
  {
    id: "purchases",
    group: "Purchase",
    label: "Purchases",
    about: "One row per line on each posted stock entry dated in the range (supplier bills, opening stock and quick adds): supplier and GSTIN, bill number, product, quantity, price, taxable value, GST and its split, and whether the credit is claimable. Voided entries are left out.",
    file: "CSV",
  },
];

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
// the first and last day of last month
function lastMonth() {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const last = new Date(d.getFullYear(), d.getMonth(), 0);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: iso(first), to: iso(last) };
}

export default function AroniumTaxReturns() {
  const [range, setRange] = useRange("month");
  const [kind, setKind] = useState<Kind>("returns");
  const [making, setMaking] = useState<"" | Kind>("");
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState<string[]>([]);
  const [help, setHelp] = useState(false);

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
  const make = (k: Kind) => (k === "purchases" ? purchases() : returns(k));
  const one = LIST.find((r) => r.id === kind)!;
  const period = range.id === "month" ? "month" : range.from === lastMonth().from && range.to === lastMonth().to ? "last" : "custom";

  return (
    <ArScreen className="ars-rep arc">
      <div className="ars-rep-body">
        <section className="ars-rep-main">
          <div className="ars-rep-head">
            <h2>Select return to download</h2>
            <button type="button" className="arc-btn" onClick={() => setHelp(true)}>
              <ArIcon name="help" size={18} /> Help
            </button>
          </div>
          {err && <p className="adm-err">{err}</p>}
          {warn.length > 0 && (
            <ArInfo tone="warn">
              <b>Check before filing</b>
              <ul>
                {warn.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </ArInfo>
          )}
          {["GST", "Tally", "Purchase"].map((g) => (
            <div key={g} className="ars-rep-group">
              <div className="art-sec">
                <h2>{g}</h2>
                <i aria-hidden="true" />
              </div>
              <ul>
                {LIST.filter((r) => r.group === g).map((r) => (
                  <li key={r.id}>
                    <button type="button" className={r.id === kind ? "is-on" : ""} title={r.about} onClick={() => setKind(r.id)} onDoubleClick={() => !making && void make(r.id)}>
                      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path d="M5 3h10v14.5H5zM8 3V1.8h4V3M7.5 7.5h5M7.5 10.5h5M7.5 13.5h3" />
                      </svg>
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="arc-note">{one.about}</p>
          <p className="arc-note">Built from the invoices, credit notes and supplier bills in the shop; check with the CA before filing.</p>
        </section>

        <aside className="ars-filter" aria-label="Filter">
          <h2>Filter</h2>
          <label>
            <span>Period</span>
            <select
              className="adm-input"
              value={period}
              onChange={(e) => {
                if (e.target.value === "month") setRange({ id: "month", from: isoDay(0).slice(0, 8) + "01", to: isoDay(0) });
                else if (e.target.value === "last") setRange({ id: "custom", ...lastMonth() });
              }}
            >
              <option value="month">This month</option>
              <option value="last">Last month</option>
              <option value="custom" disabled={period !== "custom"}>
                Custom
              </option>
            </select>
          </label>
          <div className="ars-daterange">
            <ArIcon name="calendar" size={22} />
            <input className="adm-input" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ id: "custom", from: e.target.value, to: range.to })} aria-label="From" />
            <span>-</span>
            <input className="adm-input" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ id: "custom", from: range.from, to: e.target.value })} aria-label="To" />
          </div>
          <div className="ars-filter-btns">
            {LIST.map((r) => (
              <button key={r.id} type="button" disabled={!!making} onClick={() => void make(r.id)} className={r.id === kind ? "is-on" : ""}>
                <ArIcon name={r.file === "CSV" ? "excel" : "export"} size={18} />
                {making === r.id ? "Preparing." : `${r.label} (${r.file})`}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Tax returns">
        <p>Pick the month, download, and hand it to the CA.</p>
        <p>GST returns: the GSTR-1 tables and a GSTR-3B summary. Tally registers: the sales and purchase registers, ready to import into Tally. Purchases: one row per line on each posted stock entry, with its GST split and whether the credit can be claimed.</p>
        <p>If anything needs checking first (a missing HSN code, a bill without a GSTIN), it shows at the top after the download.</p>
      </ArHelp>
    </ArScreen>
  );
}
