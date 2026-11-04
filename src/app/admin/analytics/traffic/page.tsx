"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnalyticsTabs, RangePicker, rangeLabel, useRange } from "@/components/admin/RangePicker";
import { CompareOff, Delta, Funnel, LineChart, money, SortTh, useSort, when } from "@/components/admin/ui";
import { addDays, dayLabel, daysBetween } from "@/lib/dates";
import { errText, geo, traffic, type GeoCity, type Traffic, type TrafficGroup } from "@/lib/orders-db";

// Leaflet needs the browser
const CustomerMap = dynamic(() => import("@/components/admin/CustomerMap"), { ssr: false });

// Analytics > Traffic: who visits, from where, on what, when, and what they
// look at versus what they buy. Same date range as the overview, each number
// compared with the period just before it.
const count = (n: number) => Math.round(n).toLocaleString("en-IN");
const pct = (n: number) => `${n.toFixed(1)}%`;
const share = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const mins = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

// referrer hosts as people say them
const KNOWN: Record<string, string> = { "instagram.com": "Instagram", "whatsapp.com": "WhatsApp", "google.com": "Google", "facebook.com": "Facebook", "youtube.com": "YouTube", "t.co": "X (Twitter)", "x.com": "X (Twitter)", "reddit.com": "Reddit" };
const sourceName = (s: string) => {
  if (s === "Direct") return "Direct (typed or saved link)";
  const h = s.replace(/^https?:\/\//, "").replace(/^(www|l|m|lm)\./, "").split("/")[0];
  return KNOWN[h] ?? h;
};
const pageName = (p: string) => (p === "/" ? "Home" : p === "/shop" ? "Shop" : p === "/cart" ? "Cart" : p === "/checkout" ? "Checkout" : p.startsWith("/shop/") ? `Shop › ${p.slice(6).replace(/-/g, " ")}` : p);
const devName = (d: string) => (d === "mobile" ? "Phone" : d === "unknown" ? "Unknown" : d[0].toUpperCase() + d.slice(1));

export default function TrafficPage() {
  const [range, setRange] = useRange();
  const [cur, setCur] = useState<Traffic | null>(null);
  const [prev, setPrev] = useState<Traffic | null>(null);
  const [places, setPlaces] = useState<{ cities: GeoCity[]; customers: number } | null>(null);
  const [err, setErr] = useState("");
  const { from, to } = range;

  useEffect(() => {
    const n = daysBetween(from, to);
    Promise.all([traffic(from, to), traffic(addDays(from, -n), addDays(from, -1)), geo(from, to)])
      .then(([a, b, g]) => {
        setPlaces(g);
        setCur(a);
        setPrev(b);
      })
      .catch((e) => setErr(errText(e)));
  }, [from, to]);

  const a = cur;
  const b = prev;
  const label = rangeLabel(range);

  return (
    <CompareOff.Provider value={range.id === "all"}>
    <div className="anx">
      <h1 className="sr-only">Traffic</h1>
      <AnalyticsTabs on="traffic" />
      <div className="anx-bar">
        <RangePicker value={range} onChange={(r) => (setErr(""), setRange(r))} />
        {a && range.id !== "all" && <span className="adm-muted adm-small">vs the {a.daily.length > 1 ? `${a.daily.length} days` : "day"} before</span>}
      </div>
      {err && <p className="adm-err">{err}</p>}

      {!a || !b ? (
        <p className="adm-muted">Loading.</p>
      ) : (
        <div className="adm-stack">
          <Headline a={a} b={b} label={label} />
          <Insights a={a} />

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
              <h2>When people visit</h2>
              <p className="adm-muted adm-small trf-sub">Visits by day and hour, India time. Darker is busier.</p>
              <Heatmap hours={a.hours} />
            </section>
          </div>

          {places && <CustomerMap cities={places.cities} customers={places.customers} />}

          <GroupTable title="Where visitors come from" about="The site that sent each visit. Compare how often each source's visitors reach the cart and checkout." rows={a.sources} total={a.sessions} name={sourceName} first="Source" />
          <GroupTable title="Devices" about="What people visit on." rows={a.devices} total={a.sessions} name={devName} first="Device" />

          <div className="adm-pair">
            <LandingTable rows={a.landing} />
            <PagesTable rows={a.pages} />
          </div>

          <CategoryTable rows={a.categories} />

          {a.first_visit && new Date(a.first_visit) > new Date(from) && (
            <p className="adm-muted adm-small">Visitor counting started on {when(a.first_visit)}, so earlier days show no visits.</p>
          )}
        </div>
      )}
    </div>
    </CompareOff.Provider>
  );
}

// the big number and its chart, then the quieter numbers
function Headline({ a, b, label }: { a: Traffic; b: Traffic; label: string }) {
  const bounce = (x: Traffic) => share(x.bounced, x.sessions);
  const depth = (x: Traffic) => (x.sessions ? x.views / x.sessions : 0);
  const conv = (x: Traffic) => share(x.orders, x.sessions);
  return (
    <>
      <section className="adm-card anx-hero">
        <div className="anx-hero-head">
          <div>
            <div className="anx-lab">Visitors</div>
            <div className="anx-big">
              {count(a.sessions)} <Delta now={a.sessions} before={b.sessions} />
            </div>
            <div className="adm-muted adm-small">
              {count(a.views)} page views · {pct(conv(a))} of visits ended in an order
            </div>
          </div>
          <div className="adm-legend">
            <span>
              <i />
              {label}
            </span>
            {label !== "All time" && (
              <span>
                <i className="prev" />
                Before
              </span>
            )}
          </div>
        </div>
        <LineChart height={240} label="Visitors per day" labels={a.daily.map((d) => dayLabel(d.day))} cur={a.daily.map((d) => d.sessions)} prev={b.daily.map((d) => d.sessions)} fmt={count} />
      </section>
      <div className="adm-card anx-strip">
        <Stat label="Pages per visit" value={depth(a).toFixed(1)} now={depth(a)} before={depth(b)} />
        <Stat label="Bounce rate" value={pct(bounce(a))} now={bounce(a)} before={bounce(b)} lowerIsBetter hint="Visits that saw one page and left" />
        <Stat label="Time on site" value={mins(a.engaged_secs)} now={a.engaged_secs} before={b.engaged_secs} hint="Average, for visits that went past the first page" />
        <Stat label="Reached cart" value={pct(share(a.cart_sessions, a.sessions))} now={share(a.cart_sessions, a.sessions)} before={share(b.cart_sessions, b.sessions)} />
        <Stat label="Conversion" value={pct(conv(a))} now={conv(a)} before={conv(b)} hint="Orders per visit" />
      </div>
    </>
  );
}

function Stat({ label, value, now, before, lowerIsBetter = false, hint }: { label: string; value: string; now: number; before: number; lowerIsBetter?: boolean; hint?: string }) {
  return (
    <div className="anx-stat" title={hint}>
      <div className="anx-lab">{label}</div>
      <div className={`anx-stat-val ${lowerIsBetter ? "trf-invert" : ""}`}>
        {value} <Delta now={now} before={before} />
      </div>
    </div>
  );
}

// A few plain sentences, worked out from the numbers, so the page says
// something before anyone reads a table.
function Insights({ a }: { a: Traffic }) {
  const out: { head: string; text: string }[] = [];
  const total = a.sessions;
  if (!total) return null;
  const overallCheckout = share(a.checkout_sessions, total);

  const top = a.sources[0];
  if (top) out.push({ head: "Top source", text: `${sourceName(top.name)} brings ${pct(share(top.sessions, total))} of visitors.` });

  const fair = a.sources.filter((s) => s.sessions >= Math.max(30, total * 0.03));
  const best = [...fair].sort((x, y) => share(y.checkout, y.sessions) - share(x.checkout, x.sessions))[0];
  if (best && fair.length > 1 && share(best.checkout, best.sessions) > overallCheckout * 1.08)
    out.push({ head: "Best buyers", text: `${sourceName(best.name)} visitors reach checkout ${pct(share(best.checkout, best.sessions))} of the time, against ${pct(overallCheckout)} overall.` });
  const worst = [...fair].sort((x, y) => share(y.bounced, y.sessions) - share(x.bounced, x.sessions))[0];
  if (worst && fair.length > 1 && share(worst.bounced, worst.sessions) > share(a.bounced, total) * 1.1)
    out.push({ head: "Quickest to leave", text: `${pct(share(worst.bounced, worst.sessions))} of ${sourceName(worst.name)} visitors leave after one page.` });

  const peak = [...a.hours].sort((x, y) => y.sessions - x.sessions)[0];
  if (peak) out.push({ head: "Busiest time", text: `${DOW_LONG[peak.dow - 1]}s around ${hourName(peak.hour)}. A good time to post.` });

  const phone = a.devices.find((d) => d.name === "mobile");
  if (phone) out.push({ head: "On phones", text: `${pct(share(phone.sessions, total))} of visits are on a phone.` });

  const browsed = a.categories.filter((c) => c.views >= 100).map((c) => ({ ...c, per: c.units ? c.views / c.units : Infinity }));
  const cold = [...browsed].sort((x, y) => y.per - x.per)[0];
  if (cold && browsed.length > 2)
    out.push({
      head: "Looked at, not bought",
      text: cold.units ? `${cold.name} gets ${count(cold.per)} views for every one sold. Worth a look at its prices and photos.` : `${cold.name} had ${count(cold.views)} views and no sales.`,
    });

  return (
    <ul className="trf-insights">
      {out.slice(0, 6).map((i) => (
        <li key={i.head} className="adm-card">
          <span className="anx-lab">{i.head}</span>
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

// 7 days × 24 hours, one hue from light to dark
function Heatmap({ hours }: { hours: Traffic["hours"] }) {
  const grid = DOW.map((_, d) => Array.from({ length: 24 }, (_, h) => hours.find((x) => x.dow === d + 1 && x.hour === h)?.sessions ?? 0));
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="trf-heat" role="img" aria-label="Visits by day of week and hour">
      {grid.map((row, d) => (
        <div className="trf-heat-row" key={d}>
          <span className="trf-heat-day">{DOW[d]}</span>
          {row.map((n, h) => (
            <i key={h} style={{ opacity: n ? 0.12 + 0.88 * (n / max) : 0.04 }} title={`${DOW_LONG[d]} ${hourName(h)}: ${count(n)} visit${n === 1 ? "" : "s"}`} />
          ))}
        </div>
      ))}
      <div className="trf-heat-row trf-heat-axis" aria-hidden="true">
        <span className="trf-heat-day" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h}>{h % 6 === 0 ? hourName(h) : ""}</span>
        ))}
      </div>
    </div>
  );
}

function GroupTable({ title, about, rows, total, name, first }: { title: string; about: string; rows: TrafficGroup[]; total: number; name: (s: string) => string; first: string }) {
  const { sorted, sort, toggle } = useSort(rows, {
    name: { get: (r) => name(r.name), text: true },
    sessions: { get: (r) => r.sessions },
    depth: { get: (r) => (r.sessions ? r.views / r.sessions : 0) },
    bounce: { get: (r) => share(r.bounced, r.sessions) },
    cart: { get: (r) => share(r.cart, r.sessions) },
    checkout: { get: (r) => share(r.checkout, r.sessions) },
  });
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  return (
    <section className="adm-card rpt">
      <div className="rpt-head">
        <div>
          <h2>{title}</h2>
          <p className="adm-muted adm-small">{about}</p>
        </div>
      </div>
      {!rows.length ? (
        <p className="adm-muted rpt-empty">No visits in this range.</p>
      ) : (
        <div className="rpt-scroll">
          <table className="rpt-table">
            <thead>
              <tr>
                <SortTh k="name" label={first} sort={sort} onSort={toggle} />
                <SortTh k="sessions" label="Visitors" sort={sort} onSort={toggle} right />
                <SortTh k="depth" label="Pages / visit" sort={sort} onSort={toggle} right />
                <SortTh k="bounce" label="Bounce" sort={sort} onSort={toggle} right />
                <SortTh k="cart" label="Reached cart" sort={sort} onSort={toggle} right />
                <SortTh k="checkout" label="Reached checkout" sort={sort} onSort={toggle} right />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.name}>
                  <td>
                    <span className="trf-name">{name(r.name)}</span>
                    <span className="trf-meter" aria-hidden="true">
                      <i style={{ width: `${(r.sessions / max) * 100}%` }} />
                    </span>
                  </td>
                  <td className="r">
                    {count(r.sessions)} <span className="adm-muted adm-small">{pct(share(r.sessions, total))}</span>
                  </td>
                  <td className="r">{(r.sessions ? r.views / r.sessions : 0).toFixed(1)}</td>
                  <td className="r">{pct(share(r.bounced, r.sessions))}</td>
                  <td className="r">{pct(share(r.cart, r.sessions))}</td>
                  <td className="r">{pct(share(r.checkout, r.sessions))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LandingTable({ rows }: { rows: Traffic["landing"] }) {
  const { sorted, sort, toggle } = useSort(rows, {
    name: { get: (r) => pageName(r.name), text: true },
    sessions: { get: (r) => r.sessions },
    bounce: { get: (r) => share(r.bounced, r.sessions) },
    checkout: { get: (r) => share(r.checkout, r.sessions) },
  });
  return (
    <section className="adm-card rpt">
      <div className="rpt-head">
        <div>
          <h2>First page seen</h2>
          <p className="adm-muted adm-small">Where visits start, and how many go on from there.</p>
        </div>
      </div>
      {!rows.length ? (
        <p className="adm-muted rpt-empty">No visits in this range.</p>
      ) : (
        <div className="rpt-scroll">
          <table className="rpt-table">
            <thead>
              <tr>
                <SortTh k="name" label="Page" sort={sort} onSort={toggle} />
                <SortTh k="sessions" label="Visits" sort={sort} onSort={toggle} right />
                <SortTh k="bounce" label="Bounce" sort={sort} onSort={toggle} right />
                <SortTh k="checkout" label="To checkout" sort={sort} onSort={toggle} right />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.name}>
                  <td>{pageName(r.name)}</td>
                  <td className="r">{count(r.sessions)}</td>
                  <td className="r">{pct(share(r.bounced, r.sessions))}</td>
                  <td className="r">{pct(share(r.checkout, r.sessions))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PagesTable({ rows }: { rows: Traffic["pages"] }) {
  const { sorted, sort, toggle } = useSort(rows, {
    name: { get: (r) => pageName(r.name), text: true },
    views: { get: (r) => r.views },
    visitors: { get: (r) => r.visitors },
  });
  return (
    <section className="adm-card rpt">
      <div className="rpt-head">
        <div>
          <h2>Most viewed pages</h2>
          <p className="adm-muted adm-small">Every page view, and how many different visits saw it.</p>
        </div>
      </div>
      {!rows.length ? (
        <p className="adm-muted rpt-empty">No visits in this range.</p>
      ) : (
        <div className="rpt-scroll">
          <table className="rpt-table">
            <thead>
              <tr>
                <SortTh k="name" label="Page" sort={sort} onSort={toggle} />
                <SortTh k="views" label="Views" sort={sort} onSort={toggle} right />
                <SortTh k="visitors" label="Visitors" sort={sort} onSort={toggle} right />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.name}>
                  <td>{pageName(r.name)}</td>
                  <td className="r">{count(r.views)}</td>
                  <td className="r">{count(r.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// browsing against buying, per category
function CategoryTable({ rows }: { rows: Traffic["categories"] }) {
  const per = (r: Traffic["categories"][number]) => (r.units ? r.views / r.units : null);
  const { sorted, sort, toggle } = useSort(rows, {
    name: { get: (r) => r.name, text: true },
    views: { get: (r) => r.views },
    units: { get: (r) => r.units },
    sales: { get: (r) => r.sales },
    per: { get: (r) => per(r) },
  });
  return (
    <section className="adm-card rpt">
      <div className="rpt-head">
        <div>
          <h2>Browsing vs buying</h2>
          <p className="adm-muted adm-small">
            Views of each category&apos;s shelf against what sold from it. Many views per sale means people look but don&apos;t buy: check the prices and photos there.
          </p>
        </div>
      </div>
      {!rows.length ? (
        <p className="adm-muted rpt-empty">Nothing in this range.</p>
      ) : (
        <div className="rpt-scroll">
          <table className="rpt-table">
            <thead>
              <tr>
                <SortTh k="name" label="Category" sort={sort} onSort={toggle} />
                <SortTh k="views" label="Shelf views" sort={sort} onSort={toggle} right />
                <SortTh k="units" label="Units sold" sort={sort} onSort={toggle} right />
                <SortTh k="sales" label="Sales" sort={sort} onSort={toggle} right />
                <SortTh k="per" label="Views per sale" sort={sort} onSort={toggle} right />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="r">{count(r.views)}</td>
                  <td className="r">{count(r.units)}</td>
                  <td className="r">{money(r.sales)}</td>
                  <td className="r">{per(r) == null ? "No sales" : count(per(r)!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
