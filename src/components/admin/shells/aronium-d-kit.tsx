"use client";

import { useState } from "react";
import { Dialog } from "@/components/admin/ui";
import { isoDay } from "@/lib/dates";
import { firstOrderDay } from "@/lib/orders-db";
import "./aronium-screens-a.css";
import "./aronium-screens-d.css";

// Pieces shared by the Aronium-style Online shop screens (analytics,
// storefront, messages) and the product-side lists (collections, reviews):
// Aronium's "Periodic Reports ( from - to ) 📅" date line with its quick
// periods, its Yes / No confirm window, and the row of tabs a screen draws
// under its toolbar when it holds more than one list.

type Range = { id: string; from: string; to: string };
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const QUICK: [string, string, () => [string, string]][] = [
  ["today", "Today", () => [isoDay(0), isoDay(0)]],
  ["yesterday", "Yesterday", () => [isoDay(-1), isoDay(-1)]],
  ["7", "Last 7 days", () => [isoDay(-6), isoDay(0)]],
  ["30", "Last 30 days", () => [isoDay(-29), isoDay(0)]],
  ["90", "Last 90 days", () => [isoDay(-89), isoDay(0)]],
  ["month", "This month", () => [isoDay(0).slice(0, 8) + "01", isoDay(0)]],
];

// the dashboard's date line, for any screen that reads a period: the dates in
// the title, the calendar button opening From / To and the quick periods
// (the same ones, and the same remembered choice, as the other designs)
export function ArPeriod({ title = "Periodic Reports", value, onChange, note }: { title?: string; value: Range; onChange: (r: Range) => void; note?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const today = isoDay(0);
  const pick = (from: string, to: string) => from && to && onChange(from <= to ? { id: "custom", from, to } : { id: "custom", from: to, to: from });
  return (
    <div className="ard4-period">
      <h2>
        {title} ( {dmy(value.from)} - {dmy(value.to)} )
      </h2>
      <button type="button" className="ard-cal" aria-label="Change the dates" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3M13 3v3M6.5 11.5h2M11.5 11.5h2M6.5 14h2" />
        </svg>
      </button>
      {note && <span className="ard4-period-note">{note}</span>}
      {open && (
        <div className="ard4-period-pop">
          <span className="ard4-period-dates">
            <label>
              From
              <input type="date" className="adm-input" value={value.from} max={today} onChange={(e) => pick(e.target.value, value.to)} />
            </label>
            <label>
              To
              <input type="date" className="adm-input" value={value.to} max={today} onChange={(e) => pick(value.from, e.target.value)} />
            </label>
          </span>
          <span className="ard4-period-quick" role="group" aria-label="Quick periods">
            {QUICK.map(([id, label, dates]) => (
              <button
                key={id}
                type="button"
                className={value.id === id ? "is-on" : ""}
                onClick={() => {
                  const [from, to] = dates();
                  onChange({ id, from, to });
                  setOpen(false);
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={value.id === "all" ? "is-on" : ""}
              onClick={async () => {
                const first = await firstOrderDay().catch(() => null);
                onChange({ id: "all", from: first ?? isoDay(-364), to: today });
                setOpen(false);
              }}
            >
              All time
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

// Aronium's question window: a title, a line, the red verb and Cancel
export function ArConfirm({ open, title, children, yes = "Delete", danger = true, onYes, onClose }: { open: boolean; title: string; children?: React.ReactNode; yes?: string; danger?: boolean; onYes: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <form
        className="ara-dlg"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onYes();
          onClose();
        }}
      >
        <h2>{title}</h2>
        {children && <div className="ara-help">{children}</div>}
        <div className="ara-btns">
          <button className={`adm-btn ${danger ? "bad" : "pri"}`}>{yes}</button>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// the tabs a screen draws under its toolbar (Pages | Blog | FAQs ...), with a count each
export function ArSubTabs<T extends string>({ tabs, on, onPick, label }: { tabs: readonly (readonly [T, string, number?])[]; on: T; onPick: (t: T) => void; label: string }) {
  return (
    <div className="ard4-tabs" role="tablist" aria-label={label}>
      {tabs.map(([id, name, n]) => (
        <button key={id} type="button" role="tab" aria-selected={on === id} className={on === id ? "is-on" : ""} onClick={() => onPick(id)}>
          {name}
          {n ? <b>{n}</b> : null}
        </button>
      ))}
    </div>
  );
}

// a Yes/No cell, the way Aronium's grids show a flag
export const YesNo = ({ on, yes = "Yes", no = "No" }: { on: boolean; yes?: string; no?: string }) => <span className={on ? "ard4-yes" : "ard4-no"}>{on ? yes : no}</span>;
