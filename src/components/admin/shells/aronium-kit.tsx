"use client";

import Link from "next/link";
import * as React from "react";
import "./aronium-kit.css";

// The pieces Aronium's back-office screens are built from, for the
// Aronium-style design's own screens (Documents, Products, ...): a toolbar of
// big icon-over-label buttons, a section title with a rule after it
// ("Documents (12) ─────"), and the white line icons Aronium uses.
const P: Record<string, string> = {
  add: "M10 3.5v13M3.5 10h13",
  swap: "M3.5 7h12M12 3.5 15.5 7 12 10.5M16.5 13h-12M8 9.5 4.5 13 8 16.5",
  percent: "M15.5 4.5l-11 11M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  copy: "M7 7h9.5v9.5H7zM4 13V3.5h9.5",
  merge: "M5 3.5v4.5a4 4 0 0 0 4 4h1M15 3.5v4.5a4 4 0 0 1-4 4h-1v4.5M8 14l2 2.5 2-2.5",
  sort: "M6 3.5v13M3.5 14 6 16.5 8.5 14M11 5h6M11 9h4.5M11 13h3",
  avg: "M3 16.5h14M5 13l3-4 3 2.5 4-6M14 5.5h1.5V7",
  key: "M13 3a4 4 0 0 0-3.8 5.3L3.5 14v2.5H6l1-1v-1.5h1.5l1.2-1.2A4 4 0 1 0 13 3zM14 6.2h.01",
  save: "M4 3.5h10l2.5 2.5v10.5h-13zM6.5 3.5v4h6v-4M6.5 16.5v-5h7v5",
  info: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 9v5M10 6.2h.01",
  replace: "M4 7.5h9.5l-3-3M16 12.5H6.5l3 3",
  edit: "M4 16l1-4 8-8 3 3-8 8zM11.5 5.5l3 3",
  open: "M4 4h7M4 4v12h12V9M10 10l6-6M12 4h4v4",
  del: "M5 6h10l-1 10.5H6zM3.5 6h13M8 6V3.5h4V6",
  print: "M6 8V3.5h8V8M5 14H3.5V8h13v6H15M6 11.5h8v5H6z",
  preview: "M5 3.5h7l3 3v10H5zM9.5 13.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.3 13.3 13.5 15.5",
  pdf: "M4 16.5c3-2 5-7 5.5-12 .3 4 3 8.5 6.5 9.5-4-.5-8.5.5-12 2.5z",
  refresh: "M15.5 8A6 6 0 0 0 4.6 6M4.5 12a6 6 0 0 0 10.9 2M4.5 3v3.5H8M15.5 17v-3.5H12",
  search: "M8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12.5 12.5l5 5",
  clear: "M3 4h14l-5.5 6.5V16l-3-1.5v-4zM13 13l4 4M17 13l-4 4",
  excel: "M3.5 4.5h13v11h-13zM3.5 8h13M3.5 11.8h13M8 4.5v11M7 13.5l2-3M7 10.5l2 3",
  import: "M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12",
  export: "M10 14V4M5.5 8.5 10 4l4.5 4.5M4 16.5h12",
  paid: "M4 10.5l4 4 8-9",
  box: "M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5l7 3.5 7-3.5M10 10v7",
  truck: "M2.5 5.5h9v8h-9zM11.5 8.5h3.5l2.5 2.5v2.5h-6M5.5 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM14.5 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  folder: "M2.5 5h5.5l1.5 2h8v8.5h-15z",
  folderAdd: "M2.5 5h5.5l1.5 2h8v8.5h-15zM10 9v5M7.5 11.5h5",
  folderEdit: "M2.5 5h5.5l1.5 2h8v8.5h-15zM8 13.5l.5-2 3.5-3.5 1.5 1.5-3.5 3.5z",
  tag: "M3 3h6.5l7.5 7.5-6.5 6.5L3 9.5zM6.5 6.5h.01",
  hash: "M7.5 3l-2 14M14.5 3l-2 14M3.5 7.5h14M2.5 12.5h14",
  barcode: "M3 4v12M5.5 4v12M7 4v12M9.5 4v12M12 4v12M13.5 4v12M16 4v12M17.5 4v12",
  star: "M10 2.5v15M3.5 6.2l13 7.6M16.5 6.2l-13 7.6",
  help: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM7.8 7.8a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.6M10 14.5h.01",
  history: "M10 17.5a7.5 7.5 0 1 0-7.2-9.5M2.5 3.5V8H7M10 6v4.5l3 2",
  list: "M5 4h11M5 8h11M5 12h11M5 16h11M2.5 4h.01M2.5 8h.01M2.5 12h.01M2.5 16h.01",
  calendar: "M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3M13 3v3",
};

export function ArIcon({ name, size = 30 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ""} />
    </svg>
  );
}

type Tool = { icon: string; label: string; onClick?: () => void; href?: string; disabled?: boolean; target?: string; title?: string };

// the band of big buttons across the top of a screen
export function ArToolbar({ tools, children }: { tools: (Tool | null | false)[]; children?: React.ReactNode }) {
  return (
    <div className="art-bar" role="toolbar">
      {tools.filter(Boolean).map((t) => {
        const x = t as Tool;
        const inner = (
          <>
            <ArIcon name={x.icon} />
            <span>{x.label}</span>
          </>
        );
        return x.href && !x.disabled ? (
          <Link key={x.label} href={x.href} className="art-btn" target={x.target} title={x.title}>
            {inner}
          </Link>
        ) : (
          <button key={x.label} type="button" className="art-btn" disabled={x.disabled} onClick={x.onClick} title={x.title}>
            {inner}
          </button>
        );
      })}
      {children}
    </div>
  );
}

// "Documents (12)" with a rule running off to the right
export function ArSection({ title, n, children }: { title: string; n?: number; children?: React.ReactNode }) {
  return (
    <div className="art-sec">
      <h2>
        {title}
        {n !== undefined && ` (${n})`}
      </h2>
      <i aria-hidden="true" />
      {children}
    </div>
  );
}

// Aronium's on/off switch: a green bar with the white thumb at the right when on
export function ArSwitch({ on, onChange, label, disabled, title }: { on: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  return (
    <label className={`art-switch ${disabled ? "is-off" : ""}`} title={title}>
      <button type="button" role="switch" aria-checked={on} disabled={disabled} className={on ? "is-on" : ""} onClick={() => onChange?.(!on)}>
        <i />
      </button>
      <span>{label}</span>
    </label>
  );
}

// Aronium's empty screen: the struck-through eye, a line, a blue link
export function ArEmpty({ title, action, onAction, href }: { title: string; action?: string; onAction?: () => void; href?: string }) {
  return (
    <div className="art-empty">
      <svg viewBox="0 0 64 64" width="120" height="120" aria-hidden="true">
        <path fill="#9a9a9a" d="M32 16C18 16 7.5 25 4 32c3.5 7 14 16 28 16s24.5-9 28-16c-3.5-7-14-16-28-16zm0 26a10 10 0 1 1 0-20 10 10 0 0 1 0 20z" />
        <path stroke="#252525" strokeWidth="7" d="M44 6 20 58" />
        <path stroke="#9a9a9a" strokeWidth="4" d="M44 6 20 58" />
      </svg>
      <p>{title}</p>
      {action && (href ? <Link href={href}>{action}</Link> : <button type="button" onClick={onAction}>{action}</button>)}
    </div>
  );
}

export type ArCol<T> = { k: string; label: string; right?: boolean; center?: boolean; render: (row: T) => React.ReactNode; sort?: (row: T) => string | number };

// Aronium's data grid: headers on a blue rule, click a row to select it,
// double-click (or Enter) to open it; headers sort when they can
export function ArGrid<T>({ cols, rows, keyOf, sel, onSel, onOpen, menu, className = "" }: { cols: ArCol<T>[]; rows: T[]; keyOf: (r: T) => string; sel?: string | null; onSel?: (k: string) => void; onOpen?: (r: T) => void; menu?: (row: T | null) => ArMenuItem[]; className?: string }) {
  const ctx = useArMenu();
  const [by, setBy] = React.useState<{ k: string; up: boolean } | null>(null);
  const col = by ? cols.find((c) => c.k === by.k) : undefined;
  const list = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a);
        const y = col.sort!(b);
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
        return by!.up ? d : -d;
      })
    : rows;
  return (
    <div className={`aro-grid ars-grid ${className}`} onContextMenu={menu ? (e) => ctx.open(e, menu(null)) : undefined}>
      {ctx.node}
      <table className="adm-table aro-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.k} className={c.right ? "r" : c.center ? "c" : ""} aria-sort={by?.k === c.k ? (by.up ? "ascending" : "descending") : undefined}>
                {c.sort ? (
                  <button type="button" className="ars-sort" onClick={() => setBy(by?.k === c.k ? { k: c.k, up: !by.up } : { k: c.k, up: true })}>
                    {c.label}
                    {by?.k === c.k && <span aria-hidden="true">{by.up ? " ▲" : " ▼"}</span>}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const k = keyOf(r);
            return (
              <tr
                key={k}
                tabIndex={0}
                className={k === sel ? "is-sel" : ""}
                aria-selected={k === sel}
                onClick={() => onSel?.(k)}
                onDoubleClick={() => onOpen?.(r)}
                onContextMenu={
                  menu
                    ? (e) => {
                        e.stopPropagation();
                        onSel?.(k);
                        ctx.open(e, menu(r));
                      }
                    : undefined
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen?.(r);
                }}
              >
                {cols.map((c) => (
                  <td key={c.k} className={c.right ? "r" : c.center ? "c" : ""}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// a tick in a grid cell, Aronium-style
export const Tick = ({ on }: { on: boolean }) => (on ? <span aria-label="Yes">✓</span> : <span className="adm-muted" aria-label="No" />);

// one of Aronium's screens: the dark ground, toolbar on top, the rest under it
export function ArScreen({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ars ${className}`}>{children}</div>;
}

// Aronium's right-click menu: a grey box, one item a row with its shortcut on
// the right, greyed out when it can't apply. What it offers depends on where
// you right-click (a row, the empty grid, a group), so each screen passes the
// items for that spot. Escape, a click outside or scrolling closes it.
export type ArMenuItem = { label: string; key?: string; onClick?: () => void; disabled?: boolean } | "-";

export function useArMenu() {
  const [at, setAt] = React.useState<{ x: number; y: number; items: ArMenuItem[] } | null>(null);
  React.useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", esc);
    };
  }, [at]);
  const open = (e: React.MouseEvent, items: ArMenuItem[]) => {
    // inside a text box Aronium leaves the system's Cut / Copy / Paste; so do we
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    if (!items.length) return;
    e.preventDefault();
    // keep it on screen
    const w = 220;
    const h = items.filter((x) => x !== "-").length * 38 + 8;
    // the Aronium design is drawn zoomed (shells.css): place the menu in its units
    const z = Number(getComputedStyle((e.currentTarget as HTMLElement).closest(".ar") ?? document.body).zoom) || 1;
    setAt({ x: Math.min(e.clientX / z, window.innerWidth / z - w - 4), y: Math.min(e.clientY / z, window.innerHeight / z - h - 4), items });
  };
  const node = at ? (
    <ul className="art-menu" role="menu" style={{ left: at.x, top: at.y }} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {at.items.map((it, i) =>
        it === "-" ? (
          <li key={`sep${i}`} className="art-menu-sep" role="separator" />
        ) : (
          <li key={it.label} role="none">
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              autoFocus={i === 0}
              onClick={() => {
                setAt(null);
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
  ) : null;
  return { open, node };
}

// a screen's keyboard shortcuts, Aronium's: Ctrl+N add, Del delete, F5 refresh
// (ignored while typing in a field)
export function useArKeys(keys: { add?: () => void; del?: () => void; refresh?: () => void; edit?: () => void }) {
  const ref = React.useRef(keys);
  React.useEffect(() => {
    ref.current = keys;
  });
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable=true], dialog");
      const k = ref.current;
      if (e.key === "F5" && k.refresh) {
        e.preventDefault();
        k.refresh();
      } else if (typing) return;
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && k.add) {
        e.preventDefault();
        k.add();
      } else if (e.key === "Delete" && k.del) k.del();
      else if (e.key === "F2" && k.edit) k.edit();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

// the usual menu, grouped the way Aronium groups it (a rule between groups,
// none inside one): the screen's own add verb ("New payment type", "Add
// user"; plain "Add" by default) | Edit (and its companions, e.g. Reset
// password) | the screen's extra group | Delete | Refresh. Edit, Delete and
// anything marked needs a row are greyed until one is selected.
export function stdMenu(o: {
  add?: () => void;
  addLabel?: string;
  edit?: () => void;
  editWith?: ArMenuItem[];
  del?: () => void;
  refresh?: () => void;
  has: boolean;
  extra?: ArMenuItem[];
}): ArMenuItem[] {
  const groups: ArMenuItem[][] = [
    o.add ? [{ label: o.addLabel ?? "Add", key: "Ctrl+N", onClick: o.add }] : [],
    [...(o.edit ? [{ label: "Edit", onClick: o.edit, disabled: !o.has }] : []), ...(o.editWith ?? [])],
    o.extra ?? [],
    o.del ? [{ label: "Delete", key: "Del", onClick: o.del, disabled: !o.has }] : [],
    o.refresh ? [{ label: "Refresh", key: "F5", onClick: o.refresh }] : [],
  ];
  return menuOf(...groups);
}

// a menu from groups of items: empty groups dropped, a rule between the rest
export function menuOf(...groups: ArMenuItem[][]): ArMenuItem[] {
  return groups.filter((g) => g.length).flatMap((g, i) => (i ? ["-" as const, ...g] : g));
}

// Aronium's number box with − and + either side
export function ArStepper({ value, onChange, min = 0, max, step = 1, disabled, label, suffix }: { value: number; onChange?: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; label?: string; suffix?: string }) {
  const set = (v: number) => onChange?.(Math.max(min, max === undefined ? v : Math.min(max, v)));
  return (
    <span className="art-step">
      <button type="button" aria-label={`Less${label ? ` ${label}` : ""}`} disabled={disabled || value <= min} onClick={() => set(value - step)}>
        −
      </button>
      <input type="number" aria-label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={(e) => set(Number(e.target.value) || 0)} />
      <button type="button" aria-label={`More${label ? ` ${label}` : ""}`} disabled={disabled || (max !== undefined && value >= max)} onClick={() => set(value + step)}>
        +
      </button>
      {suffix && <span className="art-step-suf">{suffix}</span>}
    </span>
  );
}
