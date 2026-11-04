"use client";

import Link from "next/link";
import { useContext, useEffect, useState } from "react";
import { Bars, CompareOff, Delta, Funnel, LineChart, money, Sparkline } from "@/components/admin/ui";
import { AnalyticsTabs, RangePicker, rangeLabel, useRange } from "@/components/admin/RangePicker";
import { addDays, dayLabel, daysBetween } from "@/lib/dates";
import { analytics, errText, profit, type Analytics, type Profit } from "@/lib/orders-db";

// The stats page. One date range drives every card, and each number is
// compared with the period just before it (the same number of days).
const count = (n: number) => n.toLocaleString("en-IN");
const pct = (n: number) => `${n.toFixed(1)}%`;
const shortMoney = (n: number) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `₹${n}`);

export default function AnalyticsPage() {
  const [range, setRange] = useRange();
  const [cur, setCur] = useState<Analytics | null>(null);
  const [prev, setPrev] = useState<Analytics | null>(null);
  const [pc, setPc] = useState<Profit | null>(null);
  const [pp, setPp] = useState<Profit | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const { from, to } = range;
  useEffect(() => {
    const n = daysBetween(from, to);
    const pFrom = addDays(from, -n);
    const pTo = addDays(from, -1);
    Promise.all([analytics(from, to), analytics(pFrom, pTo), profit(from, to), profit(pFrom, pTo)])
      .then(([a, b, c, d]) => {
        setCur(a);
        setPrev(b);
        setPc(c);
        setPp(d);
        setDays(a.daily.map((d) => d.day));
      })
      .catch((e) => setErr(errText(e)));
  }, [from, to]);

  const a = cur;
  const b = prev;
  const net = (x: Analytics) => x.gross - x.returns;
  const aov = (x: Analytics) => (x.orders ? x.gross / x.orders : 0);
  const conv = (x: Analytics) => (x.sessions ? (x.orders / x.sessions) * 100 : 0);
  const ret = (x: Analytics) => (x.customers ? (x.returning / x.customers) * 100 : 0);
  const margin = (x: Profit) => (x.costed_sales ? (x.profit / x.costed_sales) * 100 : 0);
  const label = rangeLabel(range);

  return (
    <CompareOff.Provider value={range.id === "all"}>
    <div className="anx">
      <h1 className="sr-only">Analytics</h1>
      <AnalyticsTabs on="overview" />
      <div className="anx-bar">
        <RangePicker value={range} onChange={(r) => (setErr(""), setRange(r))} />
        {days.length > 0 && range.id !== "all" && <span className="adm-muted adm-small">vs the {days.length > 1 ? `${days.length} days` : "day"} before</span>}
      </div>
      {err && <p className="adm-err">{err}</p>}

      {!a || !b || !pc || !pp ? (
        <p className="adm-muted">Loading.</p>
      ) : (
        <div className="adm-stack">
          {/* the headline: sales, big, with its chart */}
          <div className="anx-top">
            <section className="adm-card anx-hero">
              <div className="anx-hero-head">
                <div>
                  <div className="anx-lab">Sales</div>
                  <div className="anx-big">
                    {money(a.gross)} <Delta now={a.gross} before={b.gross} />
                  </div>
                  <div className="adm-muted adm-small">
                    {money(net(a))} after {money(a.returns)} returns · {count(a.orders)} order{a.orders === 1 ? "" : "s"}
                  </div>
                </div>
                <Legend columns label={label} />
              </div>
              <LineChart columns height={282} label="Gross sales per day" labels={days.map(dayLabel)} cur={a.daily.map((d) => d.gross)} prev={b.daily.map((d) => d.gross)} fmt={shortMoney} />
            </section>

            <div className="anx-kpis">
              <Kpi label="Orders" value={count(a.orders)} now={a.orders} before={b.orders} spark={a.daily.map((d) => d.orders)} />
              <Kpi label="Average order" value={money(Math.round(aov(a)))} now={aov(a)} before={aov(b)} spark={a.daily.map((d) => (d.orders ? d.gross / d.orders : 0))} />
              {pc.costed_sales ? (
                <Kpi
                  label="Gross profit"
                  value={money(Math.round(pc.profit))}
                  note={`${pct(margin(pc))} margin`}
                  now={pc.profit}
                  before={pp.profit}
                  spark={pc.daily.map((d) => d.profit)}
                />
              ) : (
                <a className="adm-card anx-kpi anx-kpi-empty" href="#profit">
                  <span className="anx-lab">Gross profit</span>
                  <span className="anx-mid">Not yet</span>
                  <span className="adm-muted adm-small">Add cost prices to products to see profit and margin.</span>
                </a>
              )}
            </div>
          </div>

          {/* the rest, quieter */}
          <div className="adm-card anx-strip">
            <Stat label="Visitors" value={count(a.sessions)} now={a.sessions} before={b.sessions} />
            <Stat label="Conversion" value={pct(conv(a))} now={conv(a)} before={conv(b)} />
            <Stat label="Items sold" value={count(a.items)} now={a.items} before={b.items} />
            <Stat label="Shipped" value={count(a.fulfilled)} now={a.fulfilled} before={b.fulfilled} />
            <Stat label="Returning customers" value={pct(ret(a))} now={ret(a)} before={ret(b)} />
          </div>

          <div className="anx-three">
            <section className="adm-card">
              <h2>Sales breakdown</h2>
              <div className="adm-kv anx-kv">
                <span>Gross sales</span>
                <span>{money(a.gross)}</span>
                <span>Returns</span>
                <span>{a.returns ? `−${money(a.returns)}` : money(0)}</span>
                <span>
                  <strong>Net sales</strong>
                </span>
                <span>
                  <strong>{money(net(a))}</strong>
                </span>
                <span>Delivery</span>
                <span>{money(a.shipping)}</span>
                <span>GST{pc.gst_on_top === 0 ? " (in prices)" : pc.gst_on_top < a.tax ? " (partly in prices)" : ""}</span>
                <span>{money(Math.round(a.tax))}</span>
                <span className="tot">Total sales</span>
                <span className="tot">{money(net(a) + a.shipping + pc.gst_on_top)}</span>
              </div>
              <p className="adm-muted adm-small anx-foot">
                Counted when placed, paid or not. {a.cancelled} cancelled order{a.cancelled === 1 ? "" : "s"} left out.
              </p>
            </section>
            <section className="adm-card">
              <h2>Top products</h2>
              <Bars rows={a.top_products.slice(0, 6).map((p) => ({ name: p.name, value: p.sales }))} fmt={money} />
            </section>
            <section className="adm-card">
              <h2>Sales by state</h2>
              <Bars rows={a.by_state.map((p) => ({ name: p.name, value: p.sales }))} fmt={money} />
            </section>
          </div>

          <SectionTitle id="profit">Profit</SectionTitle>
          <div className="adm-pair wide">
            <section className="adm-card">
              <div className="anx-card-head">
                <h2>Profit over time</h2>
                <Legend columns label={label} />
              </div>
              <LineChart
                columns
                label="Gross profit per day"
                labels={days.map(dayLabel)}
                cur={pc.daily.map((d) => d.profit)}
                prev={pp.daily.map((d) => d.profit)}
                fmt={shortMoney}
                empty="No profit to show yet. Add cost prices to products."
              />
            </section>
            <section className="adm-card">
              <h2>Profit and GST</h2>
              <div className="adm-kv anx-kv">
                <span>Sales without GST</span>
                <span>{money(Math.round(pc.costed_sales))}</span>
                <span>Cost of goods{pc.input_credit ? " (no GST)" : ""}</span>
                <span>{pc.cost ? `−${money(Math.round(pc.cost))}` : money(0)}</span>
                <span>
                  <strong>Gross profit</strong>
                </span>
                <span>
                  <strong className={pc.profit < 0 ? "adm-profit-neg" : pc.profit > 0 ? "adm-profit-pos" : ""}>{money(Math.round(pc.profit))}</strong>
                </span>
                <span>Margin</span>
                <span>{pc.costed_sales ? pct(margin(pc)) : "–"}</span>
                <span>GST collected</span>
                <span>{money(Math.round(pc.gst_collected))}</span>
                {pc.input_credit && (
                  <>
                    <span>GST paid on stock</span>
                    <span>−{money(Math.round(pc.gst_paid))}</span>
                  </>
                )}
                <span className="tot">GST to pay</span>
                <span className="tot">{money(Math.round(Math.max(0, pc.gst_collected - pc.gst_paid)))}</span>
              </div>
              <p className="adm-muted adm-small anx-foot">
                {pc.lines > 0 && pc.uncosted_lines === pc.lines
                  ? `None of the ${count(pc.lines)} items sold have a cost price yet. `
                  : pc.uncosted_lines > 0
                    ? `${count(pc.uncosted_lines)} of ${count(pc.lines)} items sold have no cost price, so profit counts the other ${count(pc.lines - pc.uncosted_lines)}. `
                    : ""}
                Cancelled and refunded orders and delivery are left out.
              </p>
            </section>
          </div>
          {pc.top.length > 0 && (
            <section className="adm-card">
              <h2>Most profitable products</h2>
              <Bars rows={pc.top.map((p) => ({ name: p.name, value: p.profit }))} fmt={money} />
            </section>
          )}

          <SectionTitle>Visitors</SectionTitle>
          <div className="adm-pair">
            <section className="adm-card">
              <h2>From visit to order</h2>
              <Funnel
                steps={[
                  { name: "Visited", value: a.sessions },
                  { name: "Added to cart", value: a.cart_sessions },
                  { name: "Reached checkout", value: a.checkout_sessions },
                  { name: "Ordered", value: a.orders },
                ]}
              />
            </section>
            <section className="adm-card">
              <div className="anx-card-head">
                <h2>Visitors over time</h2>
                <Legend label={label} />
              </div>
              <LineChart height={230} label="Visitors per day" labels={days.map(dayLabel)} cur={a.daily_sessions.map((d) => d.sessions)} prev={b.daily_sessions.map((d) => d.sessions)} fmt={(n) => count(Math.round(n))} />
            </section>
          </div>
          <div className="anx-three">
            <section className="adm-card">
              <h2>Where visitors came from</h2>
              <Bars rows={a.referrers.map((p) => ({ name: p.name, value: p.sessions }))} fmt={count} />
            </section>
            <section className="adm-card">
              <h2>Most viewed pages</h2>
              <Bars rows={a.pages.map((p) => ({ name: p.name, value: p.views }))} fmt={count} />
            </section>
            <section className="adm-card">
              <h2>Visitors by device</h2>
              <Bars rows={a.devices.map((p) => ({ name: p.name[0].toUpperCase() + p.name.slice(1), value: p.sessions }))} fmt={count} />
            </section>
          </div>
          <p className="adm-muted adm-small">
            Where visitors and customers come from, when they visit and what they browse: <Link href="/admin/analytics/traffic">Traffic</Link>.
          </p>
        </div>
      )}
    </div>
    </CompareOff.Provider>
  );
}

function Kpi({ label, value, note, now, before, spark }: { label: string; value: string; note?: string; now: number; before: number; spark: number[] }) {
  return (
    <section className="adm-card anx-kpi">
      <div>
        <div className="anx-lab">{label}</div>
        <div className="anx-mid">{value}</div>
        <div className="anx-kpi-foot">
          <Delta now={now} before={before} />
          {note && <span className="adm-muted adm-small">{note}</span>}
        </div>
      </div>
      <Sparkline values={spark} />
    </section>
  );
}

function Stat({ label, value, now, before }: { label: string; value: string; now: number; before: number }) {
  return (
    <div className="anx-stat">
      <div className="anx-lab">{label}</div>
      <div className="anx-stat-val">
        {value} <Delta now={now} before={before} />
      </div>
    </div>
  );
}

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="anx-section">
      {children}
    </h2>
  );
}

function Legend({ label, columns = false }: { label: string; columns?: boolean }) {
  const off = useContext(CompareOff);
  return (
    <div className="adm-legend">
      <span>
        <i className={columns ? "col" : ""} />
        {label}
      </span>
      {!off && (
        <span>
          <i className="prev" />
          Before
        </span>
      )}
    </div>
  );
}
