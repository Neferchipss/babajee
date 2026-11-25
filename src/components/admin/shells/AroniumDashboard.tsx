"use client";

import { useEffect, useState } from "react";
import { analytics, listOrders, salesByCategory, type Analytics, type CategorySales, type Order } from "@/lib/orders-db";
import { isoDay } from "@/lib/dates";

// The admin home in the Aronium-style design: Aronium's Management •
// Dashboard, card for card. Monthly sales for a year (one coloured bar a
// month, year back and forward), the year's total with its best month, then
// "Periodic Reports" for a date range (today to start): top products, sales
// by hour, the range's total, top categories and top customers. Sales count
// the way the Analytics page counts them: orders paid or further along, not
// test orders, before shipping.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Aronium's month colours, read off its dashboard
const MONTH_COLORS = ["#0f7f9c", "#00a2d4", "#8dcc3f", "#7cb83a", "#618a2e", "#e1a9d7", "#4a9fd4", "#ff6fa6", "#ff7b7b", "#60809e", "#1f8fe0", "#5cb6ef"];
const HOUR_COLORS = ["#0f7f9c", "#1f8fe0", "#8dcc3f", "#e1a9d7", "#5cb6ef", "#60809e", "#ff7b7b", "#00a2d4"];

const amount = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(2)}K` : `${Math.round(n)}`);
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const counted = (o: Order) => o.status !== "cancelled" && o.status !== "pending" && !o.is_test;
const istHour = (iso: string) => Number(new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false })) % 24;
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function AroniumDashboard() {
  const thisYear = Number(isoDay(0).slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [yearData, setYearData] = useState<Analytics | null>(null);
  const [hideValues, setHideValues] = useState(false);
  const [tick, setTick] = useState(0);

  const [from, setFrom] = useState(isoDay(0));
  const [to, setTo] = useState(isoDay(0));
  const [picking, setPicking] = useState(false);
  const [range, setRange] = useState<Analytics | null>(null);
  const [groups, setGroups] = useState<CategorySales[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [topN, setTopN] = useState(5);
  const [hourBy, setHourBy] = useState<"count" | "amount">("count");
  const [err, setErr] = useState("");

  useEffect(() => {
    analytics(`${year}-01-01`, `${year}-12-31`).then(setYearData, (e) => setErr(String(e?.message ?? e)));
  }, [year, tick]);
  useEffect(() => {
    Promise.all([analytics(from, to), salesByCategory(from, to)]).then(
      ([a, g]) => {
        setRange(a);
        setGroups(g);
      },
      (e) => setErr(String(e?.message ?? e)),
    );
  }, [from, to, tick]);
  useEffect(() => {
    listOrders().then(setOrders, () => {});
  }, [tick]);

  // the year, month by month
  const months = MONTHS.map((_, i) => (yearData?.daily ?? []).filter((d) => Number(d.day.slice(5, 7)) === i + 1).reduce((s, d) => s + d.gross, 0));
  const yearTotal = months.reduce((a, b) => a + b, 0);
  const best = yearTotal > 0 ? months.indexOf(Math.max(...months)) : -1;

  // the range, from the orders: by hour, and by customer
  const inRange = orders.filter((o) => counted(o) && istDay(o.created_at) >= from && istDay(o.created_at) <= to);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const at = inRange.filter((o) => istHour(o.created_at) === h);
    return hourBy === "count" ? at.length : at.reduce((s, o) => s + o.subtotal, 0);
  });
  const byCustomer = new Map<string, number>();
  for (const o of inRange) {
    const who = o.contact_name?.trim() || o.contact_email || "Walk-in customer";
    byCustomer.set(who, (byCustomer.get(who) ?? 0) + o.subtotal);
  }
  const customers = [...byCustomer].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const products = (range?.top_products ?? []).slice(0, topN);

  return (
    <div className="ard">
      {err && <p className="adm-err">{err}</p>}
      <div className="ard-row ard-top">
        <section className="ard-card ard-monthly">
          <header className="ard-head">
            <div>
              <h2>Monthly Sales - {year}</h2>
              <p>Sales data grouped by month</p>
            </div>
            <div className="ard-tools">
              <button type="button" onClick={() => setTick((t) => t + 1)} aria-label="Refresh" title="Refresh">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M15.5 8A6 6 0 0 0 4.6 6M4.5 12a6 6 0 0 0 10.9 2M4.5 3v3.5H8M15.5 17v-3.5H12" />
                </svg>
              </button>
              <button type="button" className={`ard-toggle ${hideValues ? "is-on" : ""}`} role="switch" aria-checked={hideValues} aria-label="Hide the values on the bars" onClick={() => setHideValues(!hideValues)}>
                <i />
              </button>
              <button type="button" onClick={() => setYear(year - 1)} aria-label="Previous year">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M12.5 4 6.5 10l6 6" />
                </svg>
              </button>
              <button type="button" onClick={() => setYear(year + 1)} aria-label="Next year" disabled={year >= thisYear}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m7.5 4 6 6-6 6" />
                </svg>
              </button>
            </div>
          </header>
          <Bars values={months} colors={MONTH_COLORS} names={MONTHS} labels={!hideValues} axis="Month" fmt={(v) => (v ? amount(v) : "0")} />
        </section>
        <section className="ard-card ard-total">
          <h2>Total Sales</h2>
          <b className="ard-big">{short(yearTotal)}</b>
          <p>Top performing month:</p>
          <strong className="ard-month">{best >= 0 ? MONTHS[best].toUpperCase() : "---"}</strong>
          <strong className="ard-amt">{amount(best >= 0 ? months[best] : 0)}</strong>
        </section>
      </div>

      <div className="ard-period">
        <h2>
          Periodic Reports ( {dmy(from)} - {dmy(to)} )
        </h2>
        <button type="button" className="ard-cal" aria-label="Change the dates" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3M13 3v3M6.5 11.5h2M11.5 11.5h2M6.5 14h2" />
          </svg>
        </button>
        {picking && (
          <span className="ard-dates">
            <input type="date" className="adm-input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
            <input type="date" className="adm-input" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
          </span>
        )}
      </div>

      <div className="ard-row ard-three">
        <section className="ard-card">
          <header className="ard-head">
            <h2>Top Products</h2>
            <select className="ard-select" value={topN} onChange={(e) => setTopN(Number(e.target.value))} aria-label="How many products">
              {[5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </header>
          {products.length ? (
            <table className="ard-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="r">{amount(p.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </section>
        <section className="ard-card">
          <header className="ard-head">
            <h2>Hourly Sales</h2>
            <select className="ard-select" value={hourBy} onChange={(e) => setHourBy(e.target.value as "count" | "amount")} aria-label="Count or amount">
              <option value="count">Count</option>
              <option value="amount">Amount</option>
            </select>
          </header>
          {hours.some((h) => h > 0) ? (
            <Bars values={hours} colors={HOUR_COLORS} names={hours.map((_, h) => `${h}:00`)} labels axis="" fmt={(v) => (hourBy === "count" ? String(v) : short(v))} grid tall />
          ) : (
            <Empty />
          )}
        </section>
        <section className="ard-card ard-amount">
          <h2>Total Sales (Amount)</h2>
          <b className="ard-huge">{short(range?.gross ?? 0)}</b>
        </section>
      </div>

      <div className="ard-row ard-two">
        <section className="ard-card">
          <header className="ard-head">
            <div>
              <h2>Top Product Groups</h2>
              <p>Top selling product groups in selected period</p>
            </div>
          </header>
          {groups.length ? <Ranked rows={groups.slice(0, 5).map((g) => [g.name, g.sales])} colors={MONTH_COLORS} /> : <Empty />}
        </section>
        <section className="ard-card">
          <header className="ard-head">
            <div>
              <h2>Top Customers</h2>
              <p>Lead customers in selected period (top 5)</p>
            </div>
          </header>
          {customers.length ? <Ranked rows={customers} colors={HOUR_COLORS} /> : <Empty />}
        </section>
      </div>
    </div>
  );
}

function Empty() {
  return <p className="ard-empty">No data to display</p>;
}

// vertical bars, one colour each, the value on top
function Bars({ values, colors, names, labels, axis, fmt, grid, tall }: { values: number[]; colors: string[]; names: string[]; labels: boolean; axis: string; fmt: (v: number) => string; grid?: boolean; tall?: boolean }) {
  const max = Math.max(...values, 0);
  return (
    <figure className={`ard-bars ${grid ? "has-grid" : ""} ${tall ? "is-tall" : ""}`}>
      <div className="ard-plot">
        {values.map((v, i) => (
          <div key={names[i]} className="ard-bar" title={`${names[i]}: ${fmt(v)}`}>
            {labels && <span>{fmt(v)}</span>}
            <i style={{ height: max ? `${(v / max) * 100}%` : 0, background: colors[i % colors.length] }} />
          </div>
        ))}
      </div>
      {axis && <figcaption>{axis}</figcaption>}
    </figure>
  );
}

// horizontal bars for a short ranked list
function Ranked({ rows, colors }: { rows: [string, number][]; colors: string[] }) {
  const max = Math.max(...rows.map((r) => r[1]), 0);
  return (
    <ul className="ard-ranked">
      {rows.map(([name, v], i) => (
        <li key={name}>
          <span className="ard-rname">{name}</span>
          <span className="ard-rbar">
            <i style={{ width: max ? `${(v / max) * 100}%` : 0, background: colors[i % colors.length] }} />
          </span>
          <span className="ard-rval">{amount(v)}</span>
        </li>
      ))}
    </ul>
  );
}
