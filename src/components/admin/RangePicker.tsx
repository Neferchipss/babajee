"use client";

import Link from "next/link";
import { useState } from "react";
import { dayLabel, isoDay } from "@/lib/dates";
import { firstOrderDay } from "@/lib/orders-db";

// The date range shared by Analytics and Reports: a few presets plus any two
// dates. The choice is remembered for the browser tab, so moving between the
// two pages keeps it.
export type Range = { id: string; from: string; to: string };

const PRESETS = [
  { id: "today", label: "Today", from: () => isoDay(0), to: () => isoDay(0) },
  { id: "yesterday", label: "Yesterday", from: () => isoDay(-1), to: () => isoDay(-1) },
  { id: "7", label: "Last 7 days", from: () => isoDay(-6), to: () => isoDay(0) },
  { id: "30", label: "Last 30 days", from: () => isoDay(-29), to: () => isoDay(0) },
  { id: "90", label: "Last 90 days", from: () => isoDay(-89), to: () => isoDay(0) },
  { id: "month", label: "This month", from: () => isoDay(0).slice(0, 8) + "01", to: () => isoDay(0) },
] as const;

const KEY = "adm-range";

const ALL = "All time";

function preset(id: string): Range {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[3];
  return { id: p.id, from: p.from(), to: p.to() };
}

// "Last 30 days", or "3 Oct – 18 Oct" for a custom range
export function rangeLabel(r: Range) {
  const p = PRESETS.find((x) => x.id === r.id);
  if (p) return p.label;
  if (r.id === "all") return ALL;
  return r.from === r.to ? dayLabel(r.from) : `${dayLabel(r.from)} – ${dayLabel(r.to)}`;
}

export function useRange(fallback = "30") {
  // admin pages only render in the browser (behind RequireAdmin), so the
  // saved choice can be read straight away
  const [range, setRange] = useState<Range>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Range | null;
      // presets are re-dated, so "Today" saved yesterday still means today
      // All time keeps its first day and runs to today
      if (saved) return saved.id === "custom" ? saved : saved.id === "all" ? { ...saved, to: isoDay(0) } : preset(saved.id);
    } catch {}
    return preset(fallback);
  });
  const set = (r: Range) => {
    setRange(r);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(r));
    } catch {}
  };
  return [range, set] as const;
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const today = isoDay(0);
  const custom = value.id === "custom";
  const pick = (from: string, to: string) => {
    if (!from || !to) return;
    onChange(from <= to ? { id: "custom", from, to } : { id: "custom", from: to, to: from });
  };
  return (
    <div className="rng">
      <div className="adm-chips" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`adm-chip ${value.id === p.id ? "is-on" : ""}`} onClick={() => onChange(preset(p.id))}>
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`adm-chip ${value.id === "all" ? "is-on" : ""}`}
          onClick={async () => {
            // from the first order there has ever been, to today
            const first = await firstOrderDay().catch(() => null);
            onChange({ id: "all", from: first ?? isoDay(-364), to: today });
          }}
        >
          {ALL}
        </button>
        <button type="button" className={`adm-chip ${custom ? "is-on" : ""}`} aria-expanded={custom} onClick={() => !custom && onChange({ ...value, id: "custom" })}>
          Custom
        </button>
      </div>
      {custom && (
        <div className="rng-dates">
          <label>
            <span className="sr-only">From</span>
            <input type="date" className="adm-input" value={value.from} max={today} onChange={(e) => pick(e.target.value, value.to)} />
          </label>
          <span aria-hidden>to</span>
          <label>
            <span className="sr-only">To</span>
            <input type="date" className="adm-input" value={value.to} max={today} onChange={(e) => pick(value.from, e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}

// Overview / Traffic / Reports: the page's head, and on a phone (no
// sidebar) the tabs between them
const ANALYTICS_HEAD = {
  overview: ["Overview", "How the shop is doing: sales, orders and profit for the dates you pick, against the period before."],
  traffic: ["Traffic", "Who visits, where they come from, and how far they get towards an order."],
  reports: ["Reports", "Tables to download for your accountant or to check stock: by product, by customer, stock, month by month, GST by state, and how deliveries are going."],
} as const;
export function AnalyticsTabs({ on }: { on: "overview" | "traffic" | "reports" }) {
  return (
    <>
    <header className="adm-pagehead">
      <h1>{ANALYTICS_HEAD[on][0]}</h1>
      <p>{ANALYTICS_HEAD[on][1]}</p>
    </header>
    <div className="rng-tabs adm-only-narrow" role="tablist" aria-label="Analytics">
      <Link role="tab" aria-selected={on === "overview"} href="/admin/analytics">
        Overview
      </Link>
      <Link role="tab" aria-selected={on === "traffic"} href="/admin/analytics/traffic">
        Traffic
      </Link>
      <Link role="tab" aria-selected={on === "reports"} href="/admin/analytics/reports">
        Reports
      </Link>
    </div>
    </>
  );
}
