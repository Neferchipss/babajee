"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { STATUS_LABEL, STATUS_TONE, type OrderStatus } from "@/lib/order-status";
import { homeCounts } from "@/lib/orders-db";

// ---------------------------------------------------------------- section list

const SECTIONS = [
  ["/admin", "Home"],
  ["/admin/orders", "Orders"],
  ["/admin/products", "Products"],
  ["/admin/customers", "Customers"],
  ["/admin/analytics", "Analytics"],
  ["/admin/settings", "Settings"],
] as const;

export function AdminNav() {
  const path = (usePathname() ?? "").replace(/\/$/, "") || "/";
  const [unpaid, setUnpaid] = useState(0);
  useEffect(() => {
    homeCounts()
      .then((c) => setUnpaid(c.unpaid + c.to_pack + c.to_ship))
      .catch(() => {});
  }, [path]);
  const on = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="adm-nav" aria-label="Admin sections">
      {SECTIONS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}>
          {label}
          {href === "/admin/orders" && unpaid > 0 && <span className="n">{unpaid}</span>}
        </Link>
      ))}
      <span className="gap" />
      <Link href="/shop">View shop</Link>
    </nav>
  );
}

// ---------------------------------------------------------------- sortable tables

// Click a column head to sort by it: numbers and dates biggest / newest
// first, words A to Z; click again to flip, a third time to go back to the
// list's own order.
type SortKey<T> = { get: (r: T) => string | number | null | undefined; text?: boolean };
export function useSort<T>(rows: T[], keys: Record<string, SortKey<T>>) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const sorted = useMemo(() => {
    const k = sort && keys[sort.key];
    if (!k) return rows;
    return [...rows].sort((a, b) => {
      const x = k.get(a);
      const y = k.get(b);
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-IN", { numeric: true, sensitivity: "base" });
      return sort.desc ? -d : d;
    });
    // keys is a fresh object each render; sorting follows the rows and the choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: string) =>
    setSort((s) => {
      const first = !keys[key]?.text; // numbers start high, words start at A
      if (!s || s.key !== key) return { key, desc: first };
      if (s.desc === first) return { key, desc: !first };
      return null;
    });
  return { sorted, sort, toggle };
}

export function SortTh({
  k,
  label,
  sort,
  onSort,
  right = false,
}: {
  k: string;
  label: string;
  sort: { key: string; desc: boolean } | null;
  onSort: (k: string) => void;
  right?: boolean;
}) {
  const on = sort?.key === k;
  return (
    <th className={right ? "r" : undefined} aria-sort={on ? (sort!.desc ? "descending" : "ascending") : undefined}>
      <button type="button" className={`adm-sort ${on ? "is-on" : ""}`} onClick={() => onSort(k)}>
        {label}
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path className="up" d="M3 5 6 2l3 3" />
          <path className="down" d="M3 7l3 3 3-3" />
        </svg>
      </button>
    </th>
  );
}

// ---------------------------------------------------------------- bits

export function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`adm-pill ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const DAY_Y = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

// "Today 8:12 pm", "Yesterday 6:40 pm", "2 Nov 1:05 pm", "2 Nov 2025"
export function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  const t = TIME.format(d).toLowerCase();
  if (days === 0) return `Today ${t}`;
  if (days === 1) return `Yesterday ${t}`;
  if (d.getFullYear() === now.getFullYear()) return `${DAY.format(d)} ${t}`;
  return DAY_Y.format(d);
}
export const shortDay = (iso: string) => DAY.format(new Date(iso));
export const money = (n: number) => formatPrice(n, { paise: n % 1 !== 0 });

export function Delta({ now, before, pct = true }: { now: number; before: number; pct?: boolean }) {
  // shown as a small pill; colour plus arrow, never colour alone
  if (!before && !now) return null;
  if (!before) return <span className="adm-delta flat">new</span>;
  const d = pct ? ((now - before) / before) * 100 : now - before;
  const r = Math.round(d * 10) / 10;
  if (r === 0) return <span className="adm-delta flat">0%</span>;
  return (
    <span className={`adm-delta ${r > 0 ? "up" : "down"}`}>
      {r > 0 ? "↑" : "↓"} {Math.abs(r)}
      {pct ? "%" : ""}
    </span>
  );
}

// ---------------------------------------------------------------- charts

// A line over days, with the comparison period as a quiet line behind it.
// Drawn at the card's real pixel width (measured), so text is always 11px and
// lines always 2px, whatever the card's size. Hover or tap a day to read it.
export function LineChart({
  labels,
  cur,
  prev,
  fmt,
  label,
  empty = "Nothing in this period yet.",
  columns = false,
  height = 200,
}: {
  labels: string[];
  cur: number[];
  prev?: number[];
  fmt: (n: number) => string;
  label: string;
  empty?: string;
  // daily totals (money) read better as columns; the period before stays a line
  columns?: boolean;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const gid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // on a narrow screen the chart keeps a landscape shape instead of its full desktop height
  const H = W && W < 520 ? Math.max(150, Math.min(height, Math.round(W * 0.55))) : height,
    T = 8,
    B = 26;
  const all = [...cur, ...(prev ?? [])];
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const blank = max === 0 && min === 0;
  const step = niceStep(Math.max(max - min, 1) / 4);
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(lo + step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  // left gutter wide enough for the longest axis label
  const L = Math.max(...ticks.map((t) => fmt(t).length)) * 6.4 + 10;
  const R = 8;
  const n = Math.max(cur.length, 2);
  // columns need half a slot of room at each end
  const slot = (W - L - R) / (columns ? n : n - 1);
  const x = (i: number) => L + (columns ? slot / 2 : 0) + i * slot;
  const colW = Math.max(2, Math.min(28, slot * 0.62));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const last = cur.length - 1;
  const at = hover ?? last;
  // about one date label per 90px, always including the last day
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor((W - L) / 90))));

  return (
    <div className="adm-chart">
      <div ref={box} className="adm-plot" style={{ height: H }}>
        {W > 0 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label={label}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover(Math.max(0, Math.min(last, Math.round((e.clientX - r.left - x(0)) / slot))));
            }}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" className="area-top" />
                <stop offset="1" className="area-bottom" />
              </linearGradient>
            </defs>
            {ticks.map((t) =>
              blank && t !== 0 ? null : (
                <g key={t}>
                  <line className={t === 0 ? "base" : "grid"} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
                  {!blank && (
                    <text className="axis" x={L - 8} y={y(t) + 4} textAnchor="end">
                      {fmt(t)}
                    </text>
                  )}
                </g>
              ),
            )}
            {labels.map((t, i) =>
              (i % every === 0 && last - i >= every / 2) || i === last ? (
                <text key={i} className="axis" x={x(i)} y={H - 6} textAnchor={i === last ? "end" : i === 0 ? "start" : "middle"}>
                  {t}
                </text>
              ) : null,
            )}
            {!blank && (
              <>
                {columns ? (
                  cur.map((v, i) => {
                    const z = y(Math.max(lo, 0));
                    const top = Math.min(y(v), z - (v ? 2 : 0));
                    return v === 0 ? null : (
                      <path key={i} className={`col ${v < 0 ? "neg" : ""} ${hover !== null && hover !== i ? "dim" : ""}`} d={colPath(x(i) - colW / 2, colW, v < 0 ? z : top, Math.abs(z - (v < 0 ? y(v) : top)), v >= 0)} />
                    );
                  })
                ) : (
                  cur.length > 1 && <path d={`${smooth(cur, x, y)} L${x(last)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`} fill={`url(#${gid})`} />
                )}
                {prev && prev.length > 1 && <path className="prev" d={smooth(prev, x, y)} />}
                {!columns && cur.length > 1 && <path className="cur" d={smooth(cur, x, y)} />}
                {hover !== null && !columns && <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />}
                {hover !== null && prev && prev[hover] !== undefined && <circle className="dot prev-dot" cx={x(hover)} cy={y(prev[hover])} r={3.5} />}
                {!columns && <circle className="dot" cx={x(at)} cy={y(cur[at] ?? 0)} r={4.5} />}
              </>
            )}
          </svg>
        )}
        {blank && <p className="adm-plot-empty">{empty}</p>}
        {/* hover readout, floating beside the day */}
        {hover !== null && !blank && W > 0 && (
          <div className={`adm-float ${x(hover) > W * 0.62 ? "left" : ""}`} style={{ left: x(hover), top: Math.max(T, Math.min(y(cur[hover] ?? 0), H - B - 56)) }} aria-live="polite">
            <span className="adm-muted">{labels[hover]}</span>
            <b>{fmt(cur[hover] ?? 0)}</b>
            {prev && prev[hover] !== undefined && <span className="adm-muted">before {fmt(prev[hover])}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// A column with its data end rounded and its baseline end square.
function colPath(x: number, w: number, y: number, h: number, up: boolean) {
  const r = Math.min(3, w / 2, h);
  if (up) return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  return `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`;
}

// A tiny trend line for a KPI card: shape only, no axes. Decorative; the
// number beside it carries the meaning.
export function Sparkline({ values: raw }: { values: number[] }) {
  const k = Math.max(1, Math.round(raw.length / 8));
  const values = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - k + 1), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const W = 120,
    H = 36;
  if (values.length < 2 || values.every((v) => v === 0)) return <svg className="adm-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden />;
  const max = Math.max(...values),
    min = Math.min(0, ...values);
  const x = (i: number) => (i * W) / (values.length - 1);
  const y = (v: number) => 3 + (H - 6) * (1 - (v - min) / (max - min || 1));
  const d = smooth(values, x, y);
  return (
    <svg className="adm-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path className="fill" d={`${d} L${W},${H} L0,${H} Z`} />
      <path className="line" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// A smooth line through the points that never overshoots them (monotone
// cubic), so a quiet day never dips below zero on the drawing.
function smooth(v: number[], x: (i: number) => number, y: (v: number) => number) {
  const p = v.map((val, i) => [x(i), y(val)] as const);
  if (p.length < 3) return p.map(([a, b], i) => `${i ? "L" : "M"}${a},${b}`).join(" ");
  const d = p.slice(1).map(([a, b], i) => (b - p[i][1]) / (a - p[i][0]));
  const m = p.map((_, i) => (i === 0 ? d[0] : i === p.length - 1 ? d[i - 1] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / d[i],
        b = m[i + 1] / d[i],
        h = a * a + b * b;
      if (h > 9) {
        const t = 3 / Math.sqrt(h);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
  }
  let s = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const dx = (p[i + 1][0] - p[i][0]) / 3;
    s += ` C${p[i][0] + dx},${p[i][1] + m[i] * dx} ${p[i + 1][0] - dx},${p[i + 1][1] - m[i + 1] * dx} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return s;
}

function niceStep(raw: number) {
  if (raw <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

// Ranked bars: name and value on one line, the bar under them on a faint
// track, so every bar starts on the same line whatever the name's length.
export function Bars({ rows, fmt, empty = "Nothing yet in this period." }: { rows: { name: string; value: number }[]; fmt: (n: number) => string; empty?: string }) {
  if (!rows.length) return <p className="adm-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ol className="adm-bars">
      {rows.map((r) => (
        <li className="adm-bar" key={r.name} title={`${r.name}: ${fmt(r.value)}`}>
          <span className="name">{r.name}</span>
          <span className="val">{fmt(r.value)}</span>
          <span className="track">
            <i className={r.value < 0 ? "neg" : ""} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

// Visit-to-order steps as stepped horizontal bars: each step's share of the
// visitors, and how many carried on from the step before.
export function Funnel({ steps }: { steps: { name: string; value: number }[] }) {
  const first = steps[0]?.value || 0;
  return (
    <ol className="adm-funnel">
      {steps.map((s, i) => {
        const pct = first ? (s.value / first) * 100 : 0;
        const before = i ? steps[i - 1].value : 0;
        const kept = before ? (s.value / before) * 100 : 0;
        return (
          <li key={s.name}>
            <div className="head">
              <span>{s.name}</span>
              <b>{s.value.toLocaleString("en-IN")}</b>
            </div>
            <span className="track">
              <i style={{ width: `${Math.max(0.6, pct)}%` }} />
            </span>
            <small>
              {i === 0 ? "Everyone who visited" : first ? `${pct.toFixed(pct < 10 ? 1 : 0)}% of visitors` : "–"}
              {i > 0 && before > 0 && ` · ${kept.toFixed(kept < 10 ? 1 : 0)}% of the step before`}
            </small>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- dialog

// A native <dialog>, shown as a modal while `open`.
export function Dialog({ open, onClose, children, wide = false }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    const d = document.getElementById(id) as HTMLDialogElement | null;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open, id]);
  return (
    <dialog id={id} className={`adm-dialog ${wide ? "wide" : ""}`} onClose={onClose}>
      {open && children}
    </dialog>
  );
}
