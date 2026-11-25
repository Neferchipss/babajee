"use client";

import { Fragment, useState } from "react";

// The Legacy guide's drawings: a small copy of the Legacy admin (the shop's
// header with search, the section tree down the left with its counts, the
// page with its head, chips, cards, tables and forms), drawn in the admin's
// own colour tokens so it follows light and dark. Every name on it is a real
// one from the admin; the people, orders and products are made up.
//
// In any label: "*" first marks it on (the open chip, the main button, the
// current step), "~" first greys it out, and "#n" last pins callout n to it.
// The callouts are listed under the drawing, HDRI Knight style; pointing at
// one lights its pin and the other way round.

export type LegacyMock = {
  nav?: string; // the open page in the tree, "Orders/Payment pending"
  back?: string;
  title?: string;
  sub?: string;
  actions?: string[];
  search?: string;
  chips?: string[];
  stats?: [string, string][];
  road?: string[];
  status?: string[];
  table?: { cols: string[]; rows: string[][]; sel?: number; ticks?: boolean };
  cards?: { title: string; lines?: string[]; fields?: [string, string][]; chips?: string[]; buttons?: string[] }[];
  form?: { title: string; note?: string; fields?: [string, string][]; chips?: string[]; check?: string; buttons: string[] };
};
export type LegacyFig = { label: string; mock: LegacyMock; callouts: [number, string][] };

// the tree as the Legacy menu has it (nav-data.tsx), with made-up counts
const TREE: { label: string; n?: string; pages: [string, string?][] }[] = [
  { label: "Home", pages: [] },
  {
    label: "Orders",
    n: "6",
    pages: [["All orders"], ["Payment pending", "2"], ["To pack", "3"], ["Ready to dispatch", "1"], ["On the way", "4"], ["Customer requests", "1"], ["Delivery problems"], ["Delivered"], ["Cancelled & refunded"], ["Carts"], ["New order"], ["Counter sale (till)"]],
  },
  { label: "Catalogue", pages: [["Products"], ["Categories"], ["Add a product"], ["Import from a sheet"], ["Drafts"], ["Archived"], ["Collections"], ["Reviews"]] },
  { label: "Inventory", n: "2", pages: [["Stock"], ["Purchase bills"], ["Suppliers"], ["Stock history"]] },
  { label: "Customers", pages: [["All customers"], ["Messages"], ["Sign-ins"]] },
  { label: "Finance", pages: [["GST & HSN"], ["Invoices and credit notes"], ["GST returns and Tally"], ["Profit and GST"]] },
  { label: "Storefront", pages: [["Colours and homepage"], ["Banners"], ["Pages, blog and FAQs"], ["Menus"]] },
  { label: "Analytics", pages: [["Overview"], ["Traffic"], ["Live view"], ["Reports"]] },
  { label: "Settings", pages: [["Store"], ["Team and roles"], ["Admin design"], ["Activity log"]] },
];

type Bit = { text: string; on: boolean; off: boolean; pin: number | null };
function bit(raw: string): Bit {
  let t = raw;
  const m = t.match(/#(\d+)$/);
  const pin = m ? Number(m[1]) : null;
  if (m) t = t.slice(0, -m[0].length);
  const on = t.startsWith("*");
  const off = t.startsWith("~");
  if (on || off) t = t.slice(1);
  return { text: t, on, off, pin };
}

function Pin({ n, hot, setHot }: { n: number | null; hot: number | null; setHot: (n: number | null) => void }) {
  if (n == null) return null;
  return (
    <span className={`lgm-pin ${hot === n ? "is-hot" : ""}`} onMouseEnter={() => setHot(n)} onMouseLeave={() => setHot(null)} aria-label={`Callout ${n}`}>
      {n}
    </span>
  );
}

export function LegacyFigure({ fig, data }: { fig: string; data: LegacyFig }) {
  const [hot, setHot] = useState<number | null>(null);
  const m = data.mock;
  const P = (b: Bit) => <Pin n={b.pin} hot={hot} setHot={setHot} />;
  const [navSec, navPage] = (m.nav ?? "").split("/");
  const navBit = bit(navSec ?? "");
  const pageBit = bit(navPage ?? "");
  // a pin anywhere in the sidebar (on the section or page named in nav)
  const navPin = navBit.pin ?? pageBit.pin;

  return (
    <figure className="lg-fig">
      <figcaption className="lg-eyebrow">
        <span>Fig&nbsp;{fig}</span>&nbsp;·&nbsp;{data.label}
      </figcaption>
      <div className="lgm" aria-hidden="true">
        <div className="lgm-bar">
          <span className="lgm-logo">
            <i style={{ color: "var(--color-rasta-red)" }}>ba</i>
            <i style={{ color: "var(--color-rasta-gold)" }}>ba</i>
            <i style={{ color: "var(--color-rasta-green)" }}>jee</i>
          </span>
          <span className="lgm-search">Search</span>
          <span className="lgm-me" />
        </div>
        <div className="lgm-body">
          <div className="lgm-nav">
            {TREE.map((s) => {
              const open = s.label === navBit.text;
              return (
                <div key={s.label} className={`lgm-sec ${open ? "is-on" : ""}`}>
                  <span className="lgm-sec-l">
                    <i className="lgm-ico" />
                    {s.label}
                    {s.n && <b className={s.label === "Inventory" ? "is-low" : ""}>{s.n}</b>}
                    {open && !pageBit.text && <Pin n={navPin} hot={hot} setHot={setHot} />}
                  </span>
                  {open && s.pages.length > 0 && (
                    <ul>
                      {s.pages.map(([p, c]) => (
                        <li key={p} className={p === pageBit.text ? "is-on" : ""}>
                          {p}
                          {c && <b className={p === "Customer requests" ? "is-warn" : ""}>{c}</b>}
                          {p === pageBit.text && <Pin n={navPin} hot={hot} setHot={setHot} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="lgm-main">
            {m.back && <span className="lgm-back">‹ {m.back}</span>}
            {(m.title || m.actions) && (
              <div className="lgm-head">
                <div className="lgm-grow">
                  {m.title && (
                    <span className="lgm-h1">
                      {bit(m.title).text}
                      {P(bit(m.title))}
                    </span>
                  )}
                  {m.sub && <span className="lgm-sub">{m.sub}</span>}
                </div>
                {m.status && (
                  <span className="lgm-seg">
                    {m.status.map((x) => {
                      const b = bit(x);
                      return (
                        <span key={b.text} className={b.on ? "is-on" : ""}>
                          {b.text}
                          {P(b)}
                        </span>
                      );
                    })}
                  </span>
                )}
                {m.actions?.map((x) => {
                  const b = bit(x);
                  return (
                    <span key={b.text} className={`lgm-btn ${b.on ? "is-pri" : ""} ${b.off ? "is-off" : ""}`}>
                      {b.text}
                      {P(b)}
                    </span>
                  );
                })}
              </div>
            )}

            {m.road && (
              <div className="lgm-road">
                {m.road.map((x, i) => {
                  const b = bit(x);
                  return (
                    <Fragment key={b.text}>
                      {i > 0 && <i className="lgm-road-line" />}
                      <span className={`lgm-step ${b.on ? "is-on" : ""} ${b.off ? "is-off" : ""}`}>
                        <i />
                        {b.text}
                        {P(b)}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
            )}

            {m.stats && (
              <div className="lgm-stats">
                {m.stats.map(([v, l]) => {
                  const b = bit(l);
                  return (
                    <span key={b.text} className="lgm-stat">
                      <b>{v}</b>
                      {b.text}
                      {P(b)}
                    </span>
                  );
                })}
              </div>
            )}

            {m.search && (
              <span className="lgm-input">
                {bit(m.search).text}
                {P(bit(m.search))}
              </span>
            )}

            {m.chips && (
              <div className="lgm-chips">
                {m.chips.map((x) => {
                  const b = bit(x);
                  return (
                    <span key={b.text} className={`lgm-chip ${b.on ? "is-on" : ""} ${b.off ? "is-off" : ""}`}>
                      {b.text}
                      {P(b)}
                    </span>
                  );
                })}
              </div>
            )}

            {m.cards && (
              <div className={`lgm-cards ${m.cards.length > 1 ? "is-two" : ""}`}>
                {m.cards.map((c) => {
                  const t = bit(c.title);
                  return (
                    <div key={t.text} className="lgm-card">
                      <span className="lgm-card-h">
                        {t.text}
                        {P(t)}
                      </span>
                      {c.lines?.map((l) => {
                        const b = bit(l);
                        return (
                          <span key={b.text} className={`lgm-line ${b.on ? "is-strong" : ""}`}>
                            {b.text}
                            {P(b)}
                          </span>
                        );
                      })}
                      {c.fields?.map(([k, v]) => {
                        const b = bit(k);
                        return (
                          <span key={b.text} className="lgm-field">
                            <em>
                              {b.text}
                              {P(b)}
                            </em>
                            <span className="lgm-input">{v}</span>
                          </span>
                        );
                      })}
                      {c.chips && (
                        <div className="lgm-chips">
                          {c.chips.map((x) => {
                            const b = bit(x);
                            return (
                              <span key={b.text} className={`lgm-chip ${b.on ? "is-on" : ""}`}>
                                {b.text}
                                {P(b)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {c.buttons && (
                        <div className="lgm-row">
                          {c.buttons.map((x) => {
                            const b = bit(x);
                            return (
                              <span key={b.text} className={`lgm-btn ${b.on ? "is-pri" : ""} ${b.off ? "is-off" : ""}`}>
                                {b.text}
                                {P(b)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {m.table && (
              <div className="lgm-table">
                <div className="lgm-tr is-head" style={{ gridTemplateColumns: `${m.table.ticks ? "14px " : ""}repeat(${m.table.cols.length}, minmax(0, 1fr))` }}>
                  {m.table.ticks && <i className="lgm-tick" />}
                  {m.table.cols.map((c) => {
                    const b = bit(c);
                    return (
                      <span key={b.text}>
                        {b.text}
                        {P(b)}
                      </span>
                    );
                  })}
                </div>
                {m.table.rows.map((r, i) => (
                  <div key={i} className={`lgm-tr ${m.table!.sel === i ? "is-sel" : ""}`} style={{ gridTemplateColumns: `${m.table!.ticks ? "14px " : ""}repeat(${m.table!.cols.length}, minmax(0, 1fr))` }}>
                    {m.table!.ticks && <i className={`lgm-tick ${m.table!.sel === i ? "is-on" : ""}`} />}
                    {r.map((c, k) => {
                      const b = bit(c);
                      return (
                        <span key={k} className={b.on ? "is-pill" : b.off ? "is-dim" : ""}>
                          {b.text}
                          {P(b)}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {m.form && (
              <div className="lgm-dialog">
                <span className="lgm-card-h is-big">{m.form.title}</span>
                {m.form.note && <span className="lgm-line">{m.form.note}</span>}
                {m.form.chips && (
                  <div className="lgm-chips">
                    {m.form.chips.map((x) => {
                      const b = bit(x);
                      return (
                        <span key={b.text} className={`lgm-chip ${b.on ? "is-on" : ""}`}>
                          {b.text}
                          {P(b)}
                        </span>
                      );
                    })}
                  </div>
                )}
                {m.form.fields?.map(([k, v]) => {
                  const b = bit(k);
                  return (
                    <span key={b.text} className="lgm-field">
                      <em>
                        {b.text}
                        {P(b)}
                      </em>
                      <span className="lgm-input">{v}</span>
                    </span>
                  );
                })}
                {m.form.check && (
                  <span className="lgm-check">
                    <i />
                    {bit(m.form.check).text}
                    {P(bit(m.form.check))}
                  </span>
                )}
                <div className="lgm-row is-end">
                  {m.form.buttons.map((x) => {
                    const b = bit(x);
                    return (
                      <span key={b.text} className={`lgm-btn ${b.on ? "is-pri" : ""}`}>
                        {b.text}
                        {P(b)}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {data.callouts.length > 0 && (
        <figcaption className="lg-legend">
          {data.callouts.map(([n, text]) => (
            <div key={n} className={`lg-legend-row ${hot === n ? "is-hot" : ""}`} onMouseEnter={() => setHot(n)} onMouseLeave={() => setHot(null)}>
              <span className="lg-num">{n}</span>
              <span>{text}</span>
            </div>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
