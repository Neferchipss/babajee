"use client";

import { ArIcon } from "@/components/admin/shells/aronium-kit";

// The guide's pictures: small drawings of the Aronium-style screens, made of
// the same parts (title bar, menu, tabs, toolbar, grid, right-click menu,
// slide-in panel) with made-up example data, and numbered blue badges on the
// exact control a step talks about. Each figure is plain data (guide-data.ts),
// so a step's picture is a few lines.
//
// Labels carry their marks in the text: "Mark paid#2" puts badge 2 on it,
// "~Delete" draws it greyed out (not usable here), "*To pack" marks it as the
// open/selected one. Combine them: "~*Archived#3".
export type Lbl = string;
export type Fig = {
  caption: string;
  bar?: { title: string; n?: number; help?: number; back?: number; close?: number; account?: number };
  side?: { items: Lbl[]; shop?: Lbl[]; fold?: number };
  tabs?: Lbl[];
  tools?: { icon: string; label: Lbl }[];
  // a row of controls under the toolbar: search boxes, dropdowns, switches
  strip?: Lbl[];
  grid?: { cols: Lbl[]; rows: Lbl[][]; sel?: number; mark?: { row: number; n: number } };
  // a right-click menu, drawn over the grid; groups split by "-"
  popup?: Lbl[];
  panel?: { title: string; tabs?: Lbl[]; fields: { label: Lbl; value?: string; kind?: "text" | "select" | "switch" | "stepper" | "area" | "check" }[]; save?: string; saveN?: number; cancelN?: number; banner?: string };
  // a plain dialog in the middle (the admin's own windows)
  dialog?: { title: string; lines: Lbl[]; buttons: Lbl[] };
  // free boxes for screens that aren't grids (cards, forms, charts)
  cards?: { title: Lbl; body?: string; big?: string }[];
};

export function parse(l: Lbl) {
  let s = l;
  let n: number | undefined;
  const m = s.match(/#(\d+)$/);
  if (m) {
    n = Number(m[1]);
    s = s.slice(0, m.index);
  }
  let off = false;
  let on = false;
  while (s.startsWith("~") || s.startsWith("*")) {
    if (s[0] === "~") off = true;
    else on = true;
    s = s.slice(1);
  }
  return { text: s, n, off, on };
}

export const Badge = ({ n }: { n?: number }) => (n ? <b className="hg-badge" aria-label={`Step ${n}`}>{n}</b> : null);

function L({ l, className = "" }: { l: Lbl; className?: string }) {
  const p = parse(l);
  return (
    <span className={`${className} ${p.on ? "is-on" : ""} ${p.off ? "is-off" : ""}`}>
      {p.text}
      <Badge n={p.n} />
    </span>
  );
}

export function Figure({ f }: { f: Fig }) {
  const hasSide = !!f.side;
  return (
    <figure className="hg-fig">
      <div className="hg-screen" aria-hidden="true">
        {f.bar && (
          <div className="hg-bar">
            <span className="hg-bar-back">
              ←<Badge n={f.bar.back} />
            </span>
            <span className="hg-bar-title">
              Management • {f.bar.title}
              <Badge n={f.bar.n} />
            </span>
            <span className="hg-bar-icons">
              <span>
                ?<Badge n={f.bar.help} />
              </span>
              <span>
                ◯<Badge n={f.bar.account} />
              </span>
              <span>
                ×<Badge n={f.bar.close} />
              </span>
            </span>
          </div>
        )}
        <div className={`hg-body ${hasSide ? "has-side" : ""}`}>
          {f.side && (
            <div className="hg-side">
              {f.side.items.map((l) => (
                <L key={l} l={l} className="hg-side-item" />
              ))}
              {f.side.shop && (
                <>
                  <span className="hg-side-group">Online shop</span>
                  {f.side.shop.map((l) => (
                    <L key={l} l={l} className="hg-side-item" />
                  ))}
                </>
              )}
              <span className="hg-side-fold">
                «<Badge n={f.side.fold} />
              </span>
            </div>
          )}
          <div className="hg-main">
            {f.tabs && (
              <div className="hg-tabs">
                {f.tabs.map((l) => (
                  <L key={l} l={l} className="hg-tab" />
                ))}
              </div>
            )}
            {f.tools && (
              <div className="hg-tools">
                {f.tools.map((t) => {
                  const p = parse(t.label);
                  return (
                    <span key={t.label} className={`hg-tool ${p.off ? "is-off" : ""}`}>
                      <ArIcon name={t.icon} size={18} />
                      <span>{p.text}</span>
                      <Badge n={p.n} />
                    </span>
                  );
                })}
              </div>
            )}
            {f.strip && (
              <div className="hg-strip">
                {f.strip.map((l) => (
                  <L key={l} l={l} className="hg-chip" />
                ))}
              </div>
            )}
            {f.cards && (
              <div className="hg-cards">
                {f.cards.map((c) => (
                  <div key={c.title} className="hg-card">
                    <L l={c.title} className="hg-card-title" />
                    {c.big && <span className="hg-card-big">{c.big}</span>}
                    {c.body && <span className="hg-card-body">{c.body}</span>}
                  </div>
                ))}
              </div>
            )}
            {f.grid && (
              <div className="hg-grid-wrap">
                <table className="hg-grid">
                  <thead>
                    <tr>
                      {f.grid.cols.map((c) => (
                        <th key={c}>
                          <L l={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {f.grid.rows.map((r, i) => (
                      <tr key={i} className={i === f.grid!.sel ? "is-sel" : ""}>
                        {r.map((c, j) => (
                          <td key={j}>
                            <L l={c} />
                            {j === 0 && f.grid!.mark?.row === i && <Badge n={f.grid!.mark.n} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {f.popup && (
                  <div className="hg-popup">
                    {f.popup.map((l, i) =>
                      l === "-" ? (
                        <i key={`s${i}`} className="hg-popup-sep" />
                      ) : (
                        <L key={l} l={l} className="hg-popup-item" />
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
            {!f.grid && f.popup && (
              <div className="hg-popup is-alone">
                {f.popup.map((l, i) => (l === "-" ? <i key={`s${i}`} className="hg-popup-sep" /> : <L key={l} l={l} className="hg-popup-item" />))}
              </div>
            )}
          </div>
          {f.panel && (
            <div className="hg-panel">
              <div className="hg-panel-head">
                <span>{f.panel.title}</span>
                <span>→</span>
              </div>
              {f.panel.tabs && (
                <div className="hg-tabs is-small">
                  {f.panel.tabs.map((l) => (
                    <L key={l} l={l} className="hg-tab" />
                  ))}
                </div>
              )}
              {f.panel.banner && <p className="hg-panel-banner">{f.panel.banner}</p>}
              <div className="hg-fields">
                {f.panel.fields.map((x) => {
                  const p = parse(x.label);
                  return (
                    <div key={x.label} className={`hg-field is-${x.kind ?? "text"} ${p.off ? "is-off" : ""}`}>
                      {x.kind === "switch" || x.kind === "check" ? (
                        <>
                          <i className={`hg-switch ${x.value === "on" ? "is-on" : ""} ${x.kind === "check" ? "is-check" : ""}`} />
                          <span>{p.text}</span>
                        </>
                      ) : (
                        <>
                          <span>{p.text}</span>
                          <i className="hg-input">
                            {x.kind === "stepper" ? `−  ${x.value ?? "0"}  +` : (x.value ?? "")}
                            {x.kind === "select" && <em>▾</em>}
                          </i>
                        </>
                      )}
                      <Badge n={p.n} />
                    </div>
                  );
                })}
              </div>
              <div className="hg-panel-foot">
                <span className="hg-btn">
                  ✓ {f.panel.save ?? "Save"}
                  <Badge n={f.panel.saveN} />
                </span>
                <span className="hg-btn">
                  ✕ Cancel
                  <Badge n={f.panel.cancelN} />
                </span>
              </div>
            </div>
          )}
          {f.dialog && (
            <div className="hg-dialog">
              <strong>{f.dialog.title}</strong>
              {f.dialog.lines.map((l) => (
                <L key={l} l={l} className="hg-dialog-line" />
              ))}
              <div className="hg-dialog-buttons">
                {f.dialog.buttons.map((l) => (
                  <L key={l} l={l} className="hg-btn" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption>{f.caption}</figcaption>
    </figure>
  );
}
