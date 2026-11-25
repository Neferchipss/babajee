"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ArPrintPreview from "@/components/admin/print/ArPrintPreview";
import { companyOf, reportSheet, type Company } from "@/components/admin/print/docs";
import { printSheets } from "@/components/admin/print/printing";
import { toastError } from "@/components/admin/Toaster";
import { csv, REPORTS } from "@/components/admin/reports-config";
import { isoDay } from "@/lib/dates";
import { download } from "@/lib/orders-csv";
import { errText, getSettings, report, type ReportKind, type ReportRow } from "@/lib/orders-db";
import { isTill, setTillFilter, useTillFilter, type TillFilter as TillFilterValue } from "@/lib/counter-report";
import TillFilter from "@/components/admin/counter/TillFilter";
import { ArEmpty, ArIcon, ArScreen, useArKeys } from "./aronium-kit";
import "./aronium-screens-b.css";

// Reporting in the Aronium-style design, as Aronium's Management • Reporting:
// a tab strip ("Select report", then one closable tab per opened report),
// "Select report to view or print" with the reports in groups and a search,
// and the Filter panel on the right. Show report (or a double-click) opens the
// report in its own tab, in Aronium's print preview (print/ArPrintPreview):
// white A4 pages with the report's title, period and company, its table
// broken over pages with the header row repeated, and the totals. Print and
// PDF in the Filter panel print the same pages straight away; Excel is the
// CSV. The reports are Babajee's own (reports-config.tsx).
const GROUPS: { name: string; ids: ReportKind[] }[] = [
  { name: "Sales", ids: ["products", "channels", "daily", "hourly", "hourly_groups", "items", "users", "pay_types", "pay_users", "pay_customers", "customers", "worst_sellers", "finance", "refunds", "discounts", "item_discounts"] },
  // the till's own (0086)
  { name: "Counter (till)", ids: ["till_refunds", "unpaid", "collected", "floats", "cash_moves", "voids"] },
  { name: "Customers", ids: ["new_customers", "marketing"] },
  { name: "Stock control", ids: ["stock"] },
  { name: "Tax", ids: ["gst"] },
  { name: "Delivery", ids: ["couriers", "places", "late"] },
  { name: "Returns", ids: ["returns", "return_reasons"] },
  { name: "Online shop", ids: ["product_funnel", "exit_pages"] },
];
type Opened = { id: number; kind: ReportKind; from: string; to: string; till: TillFilterValue };
const labelOf = (k: ReportKind) => REPORTS.find((r) => r.id === k)?.label ?? k;

export default function AroniumReports() {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [from, setFrom] = useState(`${isoDay(0).slice(0, 8)}01`);
  const [to, setTo] = useState(isoDay(0));
  const [q, setQ] = useState("");
  const [tabs, setTabs] = useState<Opened[]>([]);
  const [at, setAt] = useState<number | null>(null);
  const seq = useRef(0);
  const [company, setCompany] = useState<Company | null>(null);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    getSettings().then(
      (s) => setCompany(companyOf(s)),
      () => {},
    );
  }, []);
  // Print and PDF: the same pages as the preview, straight to the print window
  const printNow = (k: ReportKind | null) => {
    if (!k || printing) return;
    const def = REPORTS.find((r) => r.id === k)!;
    setPrinting(true);
    report(k, from, to).then(
      (rows) => {
        setPrinting(false);
        printSheets([reportSheet({ label: def.label, kind: k, cols: def.cols, rows, from, to, company })]);
      },
      (e) => {
        setPrinting(false);
        toastError(e);
      },
    );
  };

  const words = q.trim().toLowerCase();
  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, list: g.ids.map((id) => REPORTS.find((r) => r.id === id)).filter((r): r is (typeof REPORTS)[number] => !!r && (!words || `${r.label} ${r.about}`.toLowerCase().includes(words))) })).filter((g) => g.list.length),
    [words],
  );
  // the till reports' filter as it stood when each was opened
  const tillNow = useTillFilter();
  const openReport = (k: ReportKind | null) => {
    if (!k) return;
    seq.current += 1;
    const t = { id: seq.current, kind: k, from, to, till: tillNow };
    setTabs((x) => [...x, t]);
    setAt(t.id);
  };
  const close = (id: number) => {
    setTabs((x) => x.filter((t) => t.id !== id));
    if (at === id) setAt(null);
  };
  const current = tabs.find((t) => t.id === at) ?? null;

  return (
    <ArScreen className="ars-rep">
      <div className="ars-chiprow" role="tablist">
        <button type="button" role="tab" aria-selected={!current} className={`ars-chip ${current ? "" : "is-on"}`} onClick={() => setAt(null)}>
          <ArIcon name="search" size={13} />
          Select report
        </button>
        {tabs.map((t) => (
          <span key={t.id} className={`ars-chip ars-chip-x ${t.id === at ? "is-on" : ""}`}>
            <button type="button" role="tab" aria-selected={t.id === at} onClick={() => setAt(t.id)}>
              {labelOf(t.kind)}
            </button>
            <button type="button" aria-label={`Close ${labelOf(t.kind)}`} onClick={() => close(t.id)}>
              ×
            </button>
          </span>
        ))}
      </div>

      {current ? (
        <ReportView key={current.id} t={current} company={company} />
      ) : (
        <div className="ars-rep-body">
          <section className="ars-rep-main">
            <div className="ars-rep-head">
              <h2>Select report to view or print</h2>
              <label className="ars-rep-search">
                <input type="search" placeholder="Search reports" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" />
                <ArIcon name="search" size={18} />
              </label>
            </div>
            {groups.map((g) => (
              <div key={g.name} className="ars-rep-group">
                <div className="art-sec">
                  <h2>{g.name}</h2>
                  <i aria-hidden="true" />
                </div>
                <ul>
                  {g.list.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={r.id === kind ? "is-on" : ""}
                        title={r.about}
                        onClick={() => setKind(r.id)}
                        onDoubleClick={() => {
                          setKind(r.id);
                          openReport(r.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setKind(r.id);
                        }}
                      >
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
            {!groups.length && <ArEmpty title="No report called that" />}
          </section>

          <aside className="ars-filter" aria-label="Filter">
            <h2>Filter</h2>
            <TillFilter kind={kind && isTill(kind) ? kind : null} aronium />
            {["Customers & suppliers", "Cash register", "Product"].map((l) => (
              <label key={l}>
                <span>{l}</span>
                <select className="adm-input" disabled>
                  <option>All</option>
                </select>
              </label>
            ))}
            <label>
              <span>Product group</span>
              <select className="adm-input" disabled>
                <option>Products</option>
              </select>
            </label>
            <label className="ars-filter-check">
              <input type="checkbox" checked disabled readOnly /> Include subgroups
            </label>
            <div className="ars-daterange">
              <ArIcon name="calendar" size={22} />
              <input className="adm-input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
              <span>-</span>
              <input className="adm-input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
            </div>
            <p className="arf-note">Every report filters by dates; the till&apos;s reports also by User (who made the sale) and Channel. The other filters are Aronium&apos;s and stay on All.</p>
            <div className="ars-filter-btns">
              <button type="button" disabled={!kind} onClick={() => openReport(kind)}>
                <ArIcon name="search" size={18} /> Show report
              </button>
              <button type="button" disabled={!kind || printing} onClick={() => printNow(kind)}>
                <ArIcon name="print" size={18} /> Print
              </button>
              <button type="button" disabled={!kind} onClick={() => kind && report(kind, from, to).then((rows) => download(`babajee-${kind}-${from}-to-${to}.csv`, csv(rows, REPORTS.find((r) => r.id === kind)!.cols)))}>
                <ArIcon name="excel" size={18} /> Excel
              </button>
              <button type="button" disabled={!kind || printing} onClick={() => printNow(kind)} title="Pick “Save as PDF” as the printer">
                <ArIcon name="pdf" size={18} /> PDF
              </button>
            </div>
          </aside>
        </div>
      )}
    </ArScreen>
  );
}

// one opened report, in Aronium's print preview
function ReportView({ t, company }: { t: Opened; company: Company | null }) {
  const def = REPORTS.find((r) => r.id === t.kind)!;
  const [res, setRes] = useState<{ rows?: ReportRow[]; err?: string } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setTillFilter(t.till);
    report(t.kind, t.from, t.to).then(
      (rows) => live && setRes({ rows }),
      (e) => live && setRes({ err: errText(e) }),
    );
    return () => {
      live = false;
    };
  }, [t, tick]);
  useArKeys({ refresh: () => setTick((x) => x + 1) });
  const doc = useMemo(() => (res?.rows ? reportSheet({ label: def.label, kind: t.kind, cols: def.cols, rows: res.rows, from: t.from, to: t.to, company }) : null), [res, def, t, company]);
  return <ArPrintPreview className="ars-rep-view" fill docs={doc ? [doc] : null} loading={!res} error={res?.err} />;
}
