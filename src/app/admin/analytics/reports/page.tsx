"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnalyticsTabs, RangePicker, useRange } from "@/components/admin/RangePicker";
import { errText, getSettings, report, type ReportKind, type ReportRow } from "@/lib/orders-db";
import { csv, left, n, REPORTS, show, value } from "@/components/admin/reports-config";
import { companyOf, reportSheet } from "@/components/admin/print/docs";
import { printSheets } from "@/components/admin/print/printing";
import AroniumReports from "@/components/admin/shells/AroniumReports";
import TillFilter from "@/components/admin/counter/TillFilter";
import { isTill, useTillFilter } from "@/lib/counter-report";
import { useAdminStyle } from "@/lib/admin-style";

// Report tables: one date range, one report at a time, every column sortable,
// totals at the foot, and the whole table downloadable as CSV for a
// spreadsheet or the accountant, or printed as an A4 sheet (print/docs.ts),
// in the order it's sorted in.
function ReportsPageOriginal() {
  const [range, setRange] = useRange();
  const [kind, setKind] = useState<ReportKind>("products");
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  // the answer is kept with the question it answers, so a stale one never shows
  // the till's reports (0086) also take a channel and a cashier
  const till = useTillFilter();
  const ask = `${kind}|${range.from}|${range.to}|${isTill(kind) ? `${till.channel}|${till.cashier}` : ""}`;
  const [res, setRes] = useState<{ ask: string; rows?: ReportRow[]; err?: string } | null>(null);
  const rows = res?.ask === ask ? (res.rows ?? null) : null;
  const err = res?.ask === ask ? (res.err ?? "") : "";

  useEffect(() => {
    report(kind, range.from, range.to)
      .then((rows) => setRes({ ask, rows }))
      .catch((e) => setRes({ ask, err: errText(e) }));
  }, [ask, kind, range.from, range.to]);

  const def = REPORTS.find((r) => r.id === kind)!;
  // GST split columns only mean something once the shop's state is set
  const noSplit = kind === "gst" && !!rows?.length && rows.every((r) => r.igst == null);
  const cols = def.cols.filter(
    (c) =>
      !(noSplit && ["cgst", "sgst", "igst"].includes(c.key)) &&
      // a text column with nothing in it (no options, no phone numbers) just takes room
      !(c.fmt === "text" && !c.get && rows?.length && rows.every((r) => r[c.key] == null || r[c.key] === "")),
  );

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    const text = c.fmt === "text";
    return [...rows].sort((a, b) => {
      const x = value(a, c);
      const y = value(b, c);
      if (x == null) return 1;
      if (y == null) return -1;
      const d = text ? String(x).localeCompare(String(y)) : n(x) - n(y);
      return sort.desc ? -d : d;
    });
  }, [rows, sort, cols]);

  const totals = useMemo(() => {
    // a column with no numbers at all (no costs yet) totals to a dash, not ₹0
    const t: Record<string, number | null> = {};
    for (const c of cols)
      if (c.total) {
        const got = (rows ?? []).filter((r) => r[c.key] != null);
        t[c.key] = got.length ? got.reduce((s, r) => s + (n(r[c.key]) || 0), 0) : null;
      }
    return t;
  }, [rows, cols]);

  function download() {
    if (!rows) return;
    const blob = new Blob([csv(sorted ?? rows, cols)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `babajee-${kind}-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printIt() {
    if (!rows) return;
    const list = sorted ?? rows;
    getSettings().then(
      (st) => printSheets([reportSheet({ label: def.label, kind, cols, rows: list, from: range.from, to: range.to, company: companyOf(st) })]),
      () => printSheets([reportSheet({ label: def.label, kind, cols, rows: list, from: range.from, to: range.to, company: null })]),
    );
  }

  const by = (key: string) => setSort((s) => (s?.key === key ? (s.desc ? { key, desc: false } : null) : { key, desc: true }));

  return (
    <div className="anx">
      <h1 className="sr-only">Reports</h1>
      <AnalyticsTabs on="reports" />
      <div className="anx-bar">
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="rpt-kinds adm-chips" role="group" aria-label="Report">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`adm-chip ${kind === r.id ? "is-on" : ""}`}
            onClick={() => {
              setSort(null);
              setKind(r.id);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      {isTill(kind) && <TillFilter kind={kind} />}

      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>{def.label}</h2>
            <p className="adm-muted adm-small">
              {def.about}
              {noSplit && (
                <>
                  {" "}
                  Set the shop&apos;s state in <Link href="/admin/settings">Settings</Link> to split it into CGST, SGST and IGST.
                </>
              )}
            </p>
          </div>
          <span className="rpt-acts">
            <button type="button" className="adm-btn" disabled={!rows?.length} onClick={printIt} title="An A4 sheet: print it, or pick “Save as PDF” as the printer">
              Print
            </button>
            <button type="button" className="adm-btn" disabled={!rows?.length} onClick={download}>
              Download CSV
            </button>
          </span>
        </div>

        {err && <p className="adm-err">{err}</p>}
        {!rows && !err ? (
          <p className="adm-muted">Loading.</p>
        ) : rows && rows.length === 0 ? (
          <p className="adm-muted rpt-empty">{kind === "late" ? "Nothing late: every order shipped long enough ago has arrived." : "Nothing in this range."}</p>
        ) : (
          rows && (
            <div className="rpt-scroll">
              <table className="rpt-table">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} className={left(c) ? "" : "r"} aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                        <button type="button" onClick={() => by(c.key)}>
                          {c.label}
                          <i aria-hidden>{sort?.key === c.key ? (sort.desc ? "↓" : "↑") : ""}</i>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sorted ?? rows).map((r, i) => (
                    <tr key={i}>
                      {cols.map((c) => {
                        const v = value(r, c);
                        const neg = c.fmt === "money" && v != null && n(v) < 0;
                        return (
                          <td key={c.key} className={`${left(c) ? "" : "r"} ${v == null ? "nil" : ""} ${neg ? "neg" : ""}`}>
                            {c.href && v != null ? <Link href={c.href(r)}>{show(v, c)}</Link> : c.key === "returns" && n(v) > 0 ? `−${show(v, c)}` : show(v, c)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {rows.length > 1 && (
                  <tfoot>
                    <tr>
                      {cols.map((c, i) => (
                        <td key={c.key} className={left(c) ? "" : "r"}>
                          {i === 0 ? `Total · ${rows.length} rows` : c.total ? (c.key === "returns" && n(totals[c.key]) > 0 ? `−${show(totals[c.key], { ...c, empty: "–" })}` : show(totals[c.key], { ...c, empty: "–" })) : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )
        )}
      </section>

      <section className="adm-card rpt">
        <div className="rpt-head">
          <div>
            <h2>GST returns, Tally and purchases</h2>
            <p className="adm-muted adm-small">The GSTR-1 and GSTR-3B files, Tally registers and the purchases CSV are in Finance, with the invoice and credit note list.</p>
          </div>
          <Link className="adm-btn" href="/admin/finance/returns">
            Open Finance
          </Link>
        </div>
      </section>
    </div>
  );
}

// The Aronium-style design shows Aronium's Reporting screen instead.
export default function ReportsPage() {
  const style = useAdminStyle();
  return style === "aronium" ? <AroniumReports /> : <ReportsPageOriginal />;
}
