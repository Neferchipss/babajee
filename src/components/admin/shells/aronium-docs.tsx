"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArIcon, useArMenu, type ArMenuItem } from "./aronium-kit";
import "./aronium-screens-docs.css";

// The pieces of Aronium's Management • Documents used by the order, new
// sale, purchases, bill, invoices and carts screens: the tab strip ("View
// documents" and the open document), the document editor's header grid and
// Paid switch, its tab row, the small Edit / Delete bar over a grid, the
// totals block, the Internal note / Note pair, the footer bar (Delete, Save
// as PDF, Print preview, Print, Save ▾) and the product picker on the left
// (four search modes over a "Products" tree).

// ---------------------------------------------------------------- tab strip
export function DocStrip({ list = "View documents", listHref, onList, tab, closeHref, onClose }: { list?: string; listHref?: string; onList?: () => void; tab?: string; closeHref?: string; onClose?: () => void }) {
  return (
    <div className="arx-strip" role="tablist">
      {onList && tab ? (
        <button type="button" className="arx-tab" role="tab" aria-selected={false} onClick={onList}>
          <ArIcon name="search" size={13} />
          {list}
        </button>
      ) : listHref && tab ? (
        <Link href={listHref} className="arx-tab" role="tab" aria-selected={false}>
          <ArIcon name="search" size={13} />
          {list}
        </Link>
      ) : (
        <span className={`arx-tab ${tab ? "" : "is-on"}`} role="tab" aria-selected={!tab}>
          <ArIcon name="search" size={13} />
          {list}
        </span>
      )}
      {tab && (
        <span className="arx-tab is-on" role="tab" aria-selected>
          {tab}
          {closeHref ? (
            <Link href={closeHref} className="arx-x" aria-label={`Close ${tab}`}>
              ×
            </Link>
          ) : (
            <button type="button" className="arx-x" aria-label={`Close ${tab}`} onClick={onClose}>
              ×
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- header grid
export function DocHead({ children }: { children: React.ReactNode }) {
  return <div className="arx-head">{children}</div>;
}
export function HF({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`arx-hf ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
// a read-only value in a header field's box
export const HV = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => <span className={`arx-hv ${muted ? "is-muted" : ""}`}>{children}</span>;

// Aronium's Paid switch: red when off, green when on
export function PaidSwitch({ on, onClick, disabled, title, label = "Paid" }: { on: boolean; onClick?: () => void; disabled?: boolean; title?: string; label?: string }) {
  return (
    <label className="arx-paid" title={title}>
      <button type="button" role="switch" aria-checked={on} disabled={disabled} className={on ? "is-on" : ""} onClick={onClick}>
        <i />
      </button>
      <span>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------- tabs
export type DocTab<T extends string> = readonly [T, string, number?];
export function DocTabs<T extends string>({ tabs, on, onPick }: { tabs: readonly DocTab<T>[]; on: T; onPick: (t: T) => void }) {
  return (
    <div className="arx-tabs" role="tablist">
      {tabs.map(([id, label, n], i) => (
        <button key={id} type="button" role="tab" aria-selected={on === id} className={`${on === id ? "is-on" : ""} ${i === 2 ? "is-ext" : ""}`} onClick={() => onPick(id)}>
          {label}
          {n ? <b>{n}</b> : null}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- small bar over a grid
export type Mini = { icon: string; label: string; onClick?: () => void; href?: string; target?: string; disabled?: boolean; bordered?: boolean; title?: string };
export function MiniBar({ tools, children }: { tools: (Mini | false | null)[]; children?: React.ReactNode }) {
  return (
    <div className="arx-mini" role="toolbar">
      {tools.filter(Boolean).map((x) => {
        const t = x as Mini;
        const inner = (
          <>
            <ArIcon name={t.icon} size={16} />
            {t.label}
          </>
        );
        return t.href && !t.disabled ? (
          <Link key={t.label} href={t.href} target={t.target} className={`arx-minib ${t.bordered ? "is-b" : ""}`} title={t.title}>
            {inner}
          </Link>
        ) : (
          <button key={t.label} type="button" className={`arx-minib ${t.bordered ? "is-b" : ""}`} disabled={t.disabled} onClick={t.onClick} title={t.title}>
            {inner}
          </button>
        );
      })}
      <span className="arx-gap" />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- totals
export function DocTotals({ rows, total, totalLabel = "Total:", children }: { rows: (readonly [React.ReactNode, React.ReactNode, string?] | false | null)[]; total: React.ReactNode; totalLabel?: string; children?: React.ReactNode }) {
  return (
    <div className="arx-totals" aria-live="polite">
      {children && <div className="arx-totals-ctl">{children}</div>}
      <dl>
        {rows.filter(Boolean).map((r, i) => {
          const [k, v, cls] = r as readonly [React.ReactNode, React.ReactNode, string?];
          return (
            <div key={i} className={cls}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          );
        })}
        <div className="is-total">
          <dt>{totalLabel}</dt>
          <dd>{total}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- notes
export function DocNotes({ internal, note }: { internal: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="arx-notes">
      <div>
        <h3>Internal note</h3>
        {internal}
      </div>
      <div>
        <h3>Note</h3>
        {note}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- footer
type Foot = { label?: string; onClick?: () => void; href?: string; disabled?: boolean; title?: string };
export function DocFooter({ del, pdf, preview, print, save, saveMenu, children }: { del?: Foot; pdf?: Foot; preview?: Foot; print?: Foot; save?: Foot; saveMenu?: ArMenuItem[]; children?: React.ReactNode }) {
  const [drop, setDrop] = useState(false);
  useEffect(() => {
    if (!drop) return;
    const close = () => setDrop(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [drop]);
  const btn = (f: Foot | undefined, icon: string, label: string) => {
    const inner = (
      <>
        <ArIcon name={icon} size={16} />
        {f?.label ?? label}
      </>
    );
    return f?.href && !f.disabled ? (
      <Link href={f.href} target="_blank" className="arx-fb" title={f.title}>
        {inner}
      </Link>
    ) : (
      <button type="button" className="arx-fb" disabled={!f || f.disabled || !f.onClick} onClick={f?.onClick} title={f?.title}>
        {inner}
      </button>
    );
  };
  return (
    <div className="arx-foot">
      {children}
      <span className="arx-gap" />
      <div className="arx-fgroup">
        {btn(del, "del", "Delete")}
        {btn(pdf, "pdf", "Save as PDF")}
        {btn(preview, "preview", "Print preview")}
        {btn(print, "print", "Print")}
      </div>
      <div className="arx-save">
        <button type="button" className="arx-fb is-save" disabled={!save || save.disabled} onClick={save?.onClick} title={save?.title}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M3.5 10.5l4 4 9-9" />
          </svg>
          {save?.label ?? "Save"}
        </button>
        <button type="button" className="arx-fb is-drop" aria-label="More save options" aria-expanded={drop} disabled={!saveMenu?.length} onClick={() => setDrop((d) => !d)}>
          ▾
        </button>
        {drop && saveMenu && (
          <ul className="art-menu arx-drop" role="menu" onMouseDown={(e) => e.stopPropagation()}>
            {saveMenu.map((it, i) =>
              it === "-" ? (
                <li key={`sep${i}`} className="art-menu-sep" role="separator" />
              ) : (
                <li key={it.label} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setDrop(false);
                      it.onClick?.();
                    }}
                  >
                    <span>{it.label}</span>
                    {it.key && <kbd>{it.key}</kbd>}
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- product picker
// What the picker lists: one row per option, grouped (a category, or a
// product whose options are listed under it).
export type PickRow = { key: string; group: string; name: string; label: string; code?: string | null; barcode?: string | null; note?: string };
type Mode = "name" | "barcode" | "code";

export function ProductTree({ rows, onPick, onRefresh, loading }: { rows: PickRow[] | null; onPick: (key: string) => void; onRefresh?: () => void; loading?: boolean }) {
  const [mode, setMode] = useState<Mode>("name");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const ctx = useArMenu();
  const groups = useMemo(() => {
    const m = new Map<string, PickRow[]>();
    for (const r of rows ?? []) m.set(r.group, [...(m.get(r.group) ?? []), r]);
    return [...m.entries()];
  }, [rows]);
  const found = useMemo(() => {
    const w = q.trim().toLowerCase();
    if (!w || !rows) return null;
    return rows
      .filter((r) => (mode === "barcode" ? (r.barcode ?? "").toLowerCase().includes(w) : mode === "code" ? (r.code ?? "").toLowerCase().includes(w) : `${r.name} ${r.label}`.toLowerCase().includes(w)))
      .slice(0, 60);
  }, [q, rows, mode]);
  const toggle = (g: string) => setOpen((s) => (s.has(g) ? new Set([...s].filter((x) => x !== g)) : new Set(s).add(g)));
  const pick = (r: PickRow) => {
    onPick(r.key);
  };
  const row = (r: PickRow) => (
    <li key={r.key}>
      <button type="button" className="arx-leaf" onDoubleClick={() => pick(r)} onClick={() => pick(r)} title={`Add ${r.name}${r.label ? `, ${r.label}` : ""}`}>
        <span>
          {r.name}
          {r.label && <small> · {r.label}</small>}
        </span>
        {r.note && <em>{r.note}</em>}
      </button>
    </li>
  );
  return (
    <div className="arx-pick" onContextMenu={(e) => ctx.open(e, onRefresh ? [{ label: "Refresh", key: "F5", onClick: onRefresh }] : [])}>
      <div className="arx-pick-search">
        <button type="button" className={mode === "name" ? "is-on" : ""} aria-pressed={mode === "name"} title="Search by name" onClick={() => setMode("name")}>
          <ArIcon name="star" size={15} />
        </button>
        <button type="button" className={mode === "barcode" ? "is-on" : ""} aria-pressed={mode === "barcode"} title="Search by barcode" onClick={() => setMode("barcode")}>
          <ArIcon name="barcode" size={15} />
        </button>
        <button type="button" className={mode === "code" ? "is-on" : ""} aria-pressed={mode === "code"} title="Search by code (SKU)" onClick={() => setMode("code")}>
          <ArIcon name="hash" size={15} />
        </button>
        <button type="button" className="is-on is-tag" title="Products by group" aria-pressed={!q} onClick={() => setQ("")}>
          <ArIcon name="tag" size={15} />
        </button>
        <label>
          <ArIcon name="search" size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === "barcode" ? "Barcode" : mode === "code" ? "Product code" : "Product name"}
            aria-label="Find a product"
            onKeyDown={(e) => {
              if (e.key === "Enter" && found?.[0]) {
                e.preventDefault();
                pick(found[0]);
                setQ("");
              }
            }}
          />
        </label>
      </div>
      <div className="arx-pick-tree">
        {rows === null || loading ? (
          <p className="arx-dim">Loading products.</p>
        ) : found ? (
          found.length ? (
            <ul>{found.map(row)}</ul>
          ) : (
            <p className="arx-dim">Nothing matches.</p>
          )
        ) : (
          <>
            <span className="arx-root">
              <ArIcon name="folder" size={14} />
              Products
            </span>
            <ul>
              {groups.map(([g, rs]) => (
                <li key={g}>
                  <button type="button" className="arx-node" aria-expanded={open.has(g)} onClick={() => toggle(g)}>
                    <i aria-hidden="true">{open.has(g) ? "▾" : "▸"}</i>
                    <ArIcon name="folder" size={14} />
                    {g}
                    <small>{rs.length}</small>
                  </button>
                  {open.has(g) && <ul>{rs.map(row)}</ul>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {ctx.node}
    </div>
  );
}

// a modal band across the middle of the dimmed screen (Aronium's "Select
// document type" and its confirmations): title, body, ✓ OK / ✕ Cancel
export function Band({ open, title, children, ok = "OK", okDanger, canOk = true, busy, onOk, onCancel }: { open: boolean; title: string; children: React.ReactNode; ok?: string; okDanger?: boolean; canOk?: boolean; busy?: boolean; onOk?: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="arx-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form
        className="arx-band"
        role="dialog"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          if (canOk && !busy) onOk?.();
        }}
        onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}
      >
        <h2>{title}</h2>
        <div className="arx-band-body">{children}</div>
        <div className="arx-band-btns">
          {onOk && (
            <button className={`arx-fb is-ok ${okDanger ? "is-bad" : ""}`} disabled={!canOk || busy}>
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M3.5 10.5l4 4 9-9" />
              </svg>
              {busy ? "Working" : ok}
            </button>
          )}
          <button type="button" className="arx-fb" disabled={busy} onClick={onCancel}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
            </svg>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Aronium's dates read dd-mm-yyyy
export const dmy = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};
export const dmyTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${dmy(iso)} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};
