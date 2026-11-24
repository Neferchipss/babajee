"use client";

import { layout, type SheetDoc } from "@/lib/print-sheet";
import "./print.css";

// One document drawn as Aronium prints it: white A4 pages, the bold title and
// the details block on the first, a boxed table whose header row repeats on
// every page, the totals row and any boxes (GST summary, totals) and notes on
// the last, and "Page n of N" with the printed date at each page's foot. The
// page breaks come from lib/print-sheet.ts, so what's on screen is what
// prints. A sheet whose columns can't fit upright prints sideways.
const printedOn = () => new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function SheetPages({ doc }: { doc: SheetDoc }) {
  const { paper, widths, pages } = layout(doc);
  const when = printedOn();
  const align = (i: number) => doc.cols[i]?.align ?? "l";
  return (
    <>
      {pages.map(([s, e], p) => {
        const last = p === pages.length - 1;
        return (
          <section key={p} className={`prs-page ${paper.land ? "is-land" : ""}`} data-page={p + 1}>
            {doc.stamp && <div className="prs-stamp">{doc.stamp}</div>}
            {p === 0 && (
              <header className="prs-top">
                <h1>{doc.title.toUpperCase()}</h1>
                {(doc.meta?.length ?? 0) + (doc.metaRight?.length ?? 0) > 0 && (
                  <div className="prs-meta">
                    <dl>
                      {(doc.meta ?? []).map(([k, v], i) => (
                        <div key={i}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <dl>
                      {(doc.metaRight ?? []).map(([k, v], i) => (
                        <div key={i}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </header>
            )}
            {doc.cols.length > 0 && (e > s || p === 0 || (last && !!doc.totals?.some((t) => t))) && (
              <table className="prs-table">
                <colgroup>
                  {widths.map((w, i) => (
                    <col key={i} style={{ width: `${w}px` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {doc.cols.map((c, i) => (
                      <th key={i} className={`is-${align(i)}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doc.rows.slice(s, e).map((r, i) =>
                    r.cells ? (
                      <tr key={i}>
                        {r.cells.map((c, j) => (
                          <td key={j} className={`is-${align(j)}`}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ) : (
                      <tr key={i} className="prs-group">
                        <td colSpan={doc.cols.length}>{r.group}</td>
                      </tr>
                    ),
                  )}
                  {!doc.rows.length && p === 0 && (
                    <tr className="prs-none">
                      <td colSpan={doc.cols.length}>Nothing to show.</td>
                    </tr>
                  )}
                </tbody>
                {last && doc.totals?.some((t) => t) && (
                  <tfoot>
                    <tr>
                      {doc.cols.map((_, i) => (
                        <td key={i} className={`is-${align(i)} ${doc.totals?.[i] ? "is-boxed" : ""}`}>
                          {doc.totals?.[i] ?? ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
            {last && (doc.boxes?.length || doc.notes?.length) ? (
              <div className="prs-tail">
                {doc.boxes?.map((b, i) => (
                  <div key={i} className="prs-box">
                    {b.title && <h2>{b.title}</h2>}
                    <dl>
                      {b.lines.map((l, j) => (
                        <div key={j} className={l.strong ? "is-strong" : ""}>
                          <dt>{l.label}</dt>
                          <dd>{l.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                {doc.notes?.map((n, i) => (
                  <p key={i} className="prs-note">
                    {n}
                  </p>
                ))}
              </div>
            ) : null}
            <footer className="prs-foot">
              <span>Printed {when}</span>
              <span>
                Page {p + 1} of {pages.length}
              </span>
            </footer>
          </section>
        );
      })}
    </>
  );
}

// several documents one after another (one print job, each starting a page)
export function SheetSet({ docs }: { docs: SheetDoc[] }) {
  return (
    <>
      {docs.map((d, i) => (
        <SheetPages key={i} doc={d} />
      ))}
    </>
  );
}
