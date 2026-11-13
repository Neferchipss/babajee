"use client";

import { money } from "@/components/admin/ui";
import type { TrafficInsights as Insights } from "@/lib/orders-db";

// The deeper half of Analytics > Traffic (migration 0049): who comes back and
// how many visits an order takes, what people search for (and don't find),
// where checkout stops them, and which tagged links brought orders. Every
// figure shows its count, so a percentage on a handful of visits reads as
// the handful it is.
const count = (n: number) => Math.round(n).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");
const num = (n: number | null, d = 1) => (n == null ? "–" : Number(n).toFixed(d).replace(/\.0+$/, ""));

export default function TrafficInsights({ x }: { x: Insights }) {
  return (
    <>
      <div className="adm-pair">
        <Visitors x={x} />
        <Steps x={x} />
      </div>
      <div className="adm-pair">
        <Searches x={x} />
        <Campaigns x={x} />
      </div>
    </>
  );
}

function Visitors({ x }: { x: Insights }) {
  const t = x.to_order;
  return (
    <section className="adm-card">
      <h2>Visitors and coming back</h2>
      <p className="adm-muted adm-small">The same browser counts as one visitor across visits. Counted since visitors started being remembered.</p>
      {!x.visitors ? (
        <p className="adm-muted rpt-empty">No remembered visitors in this range yet.</p>
      ) : (
        <table className="rpt-table">
          <tbody>
            <tr>
              <td>Visitors</td>
              <td className="r">{count(x.visitors)}</td>
            </tr>
            <tr>
              <td>New in this range</td>
              <td className="r">
                {count(x.new_visitors)} <span className="adm-muted adm-small">{pct(x.new_visitors, x.visitors)}</span>
              </td>
            </tr>
            <tr>
              <td>Came back (seen before, or visited again)</td>
              <td className="r">
                {count(x.returning_visitors)} <span className="adm-muted adm-small">{pct(x.returning_visitors, x.visitors)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      )}
      <h3 className="adm-small" style={{ marginTop: 16 }}>
        What an order takes
      </h3>
      {!t.orders ? (
        <p className="adm-muted adm-small">No orders from remembered visitors in this range yet.</p>
      ) : (
        <table className="rpt-table">
          <tbody>
            <tr>
              <td>Orders counted</td>
              <td className="r">{count(t.orders)}</td>
            </tr>
            <tr>
              <td>Visits before ordering (median · average)</td>
              <td className="r">
                {num(t.visits_median)} · {num(t.visits_avg, 2)}
              </td>
            </tr>
            <tr>
              <td>Days from first visit (median)</td>
              <td className="r">{num(t.days_median)}</td>
            </tr>
            <tr>
              <td>Ordered on the first visit</td>
              <td className="r">
                {count(t.first_visit)} <span className="adm-muted adm-small">{pct(t.first_visit, t.orders)}</span>
              </td>
            </tr>
            <tr>
              <td>After 2–3 visits</td>
              <td className="r">
                {count(t.two_three)} <span className="adm-muted adm-small">{pct(t.two_three, t.orders)}</span>
              </td>
            </tr>
            <tr>
              <td>After 4 or more</td>
              <td className="r">
                {count(t.four_plus)} <span className="adm-muted adm-small">{pct(t.four_plus, t.orders)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

const STEP_NAMES: Record<string, string> = {
  submit: "Pressed Place order",
  "sign-in needed": "Asked to log in",
  "blocked: no address": "Stopped: no address chosen",
  "blocked: empty cart": "Stopped: empty cart",
  "blocked: no price": "Stopped: an item had no price",
  "blocked: stock": "Stopped: not enough stock",
  "error: offline": "Failed: no connection",
};
const stepName = (s: string) => STEP_NAMES[s] ?? (s.startsWith("error: ") ? `Failed: ${s.slice(7)}` : s);

function Steps({ x }: { x: Insights }) {
  return (
    <section className="adm-card">
      <h2>Checkout steps</h2>
      <p className="adm-muted adm-small">
        Of {count(x.checkout_visits)} visits that reached checkout, how many hit each step or problem. Errors show the message the customer saw.
      </p>
      {!x.steps.length ? (
        <p className="adm-muted rpt-empty">No checkout steps recorded in this range yet.</p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>Step</th>
              <th className="r">Visits</th>
              <th className="r">Of checkout</th>
            </tr>
          </thead>
          <tbody>
            {x.steps.map((s) => (
              <tr key={s.step}>
                <td>{stepName(String(s.step))}</td>
                <td className="r">
                  {count(s.visits)}
                  {s.times > s.visits && <span className="adm-muted adm-small"> ({count(s.times)}×)</span>}
                </td>
                <td className="r">{pct(s.visits, x.checkout_visits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Searches({ x }: { x: Insights }) {
  return (
    <section className="adm-card">
      <h2>What people search for</h2>
      <p className="adm-muted adm-small">
        {count(x.search_visits)} visits searched. Each search counts once per visit, with the number of products it found.
      </p>
      {!x.searches.length ? (
        <p className="adm-muted rpt-empty">No searches in this range yet.</p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>Search</th>
              <th className="r">Visits</th>
              <th className="r">Found (avg)</th>
            </tr>
          </thead>
          <tbody>
            {x.searches.map((s) => (
              <tr key={String(s.q)}>
                <td>{String(s.q)}</td>
                <td className="r">{count(s.visits)}</td>
                <td className="r">{s.empty === s.visits ? <span className="adm-err">none</span> : num(s.avg_hits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {x.empty_searches.length > 0 && (
        <>
          <h3 className="adm-small" style={{ marginTop: 16 }}>
            Searched, found nothing
          </h3>
          <p className="adm-muted adm-small">What people wanted and the shop didn&apos;t show: missing stock, or a name customers use that the listing doesn&apos;t.</p>
          <p className="adm-small">{x.empty_searches.map((s) => `${String(s.q)} (${count(s.visits)})`).join(" · ")}</p>
        </>
      )}
    </section>
  );
}

function Campaigns({ x }: { x: Insights }) {
  return (
    <section className="adm-card">
      <h2>Campaigns</h2>
      <p className="adm-muted adm-small">
        Visits from links tagged with utm_source / utm_medium / utm_campaign, e.g. babajee.in/?utm_source=instagram&amp;utm_medium=story&amp;utm_campaign=diwali.
      </p>
      {!x.campaigns.length ? (
        <p className="adm-muted rpt-empty">No tagged links in this range. Tag the links you post to see them here.</p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th className="r">Visits</th>
              <th className="r">Ordered</th>
              <th className="r">Sales</th>
            </tr>
          </thead>
          <tbody>
            {x.campaigns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td className="r">{count(c.visits)}</td>
                <td className="r">
                  {pct(c.ordered, c.visits)} <span className="adm-muted adm-small">{count(c.ordered)}</span>
                </td>
                <td className="r">{money(c.sales)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
