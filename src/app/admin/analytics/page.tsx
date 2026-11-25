"use client";

import Link from "next/link";
import { Fragment, useContext, useEffect, useState } from "react";
import { Bars, CompareOff, Delta, LineChart, money, Sparkline } from "@/components/admin/ui";
import { AnalyticsTabs, RangePicker, rangeLabel, useRange } from "@/components/admin/RangePicker";
import { addDays, dayLabel, daysBetween } from "@/lib/dates";
import { itc, unpaidBills, type ItcMonth, type UnpaidBill } from "@/lib/stock-in/db";
import { analytics, errText, failedDeliveries, profit, salesByAge, salesByCategory, savedProducts, type AgeSales, type Analytics, type CategorySales, type Profit, type SavedProduct } from "@/lib/orders-db";
import ArAnalyticsScreen from "@/components/admin/shells/AroniumAnalytics";
import { ArPeriod } from "@/components/admin/shells/aronium-d-kit";
import { useAdminStyle } from "@/lib/admin-style";

// The stats page. One date range drives every card, and each number is
// compared with the period just before it (the same number of days).
const count = (n: number) => n.toLocaleString("en-IN");
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const pct = (n: number) => `${n.toFixed(1)}%`;
const shortMoney = (n: number) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `₹${n}`);

export default function AnalyticsPage() {
  return useAdminStyle() === "aronium" ? (
    <ArAnalyticsScreen kind="overview">
      <AnalyticsPageOriginal ar />
    </ArAnalyticsScreen>
  ) : (
    <AnalyticsPageOriginal />
  );
}

function AnalyticsPageOriginal({ ar = false }: { ar?: boolean }) {
  const [range, setRange] = useRange();
  const [cur, setCur] = useState<Analytics | null>(null);
  const [prev, setPrev] = useState<Analytics | null>(null);
  const [pc, setPc] = useState<Profit | null>(null);
  const [pp, setPp] = useState<Profit | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const { from, to } = range;
  // sales by category, for the chosen dates
  const [catsFor, setCatsFor] = useState<{ key: string; rows: CategorySales[] } | null>(null);
  useEffect(() => {
    const key = `${from}:${to}`;
    salesByCategory(from, to).then(
      (rows) => setCatsFor({ key, rows }),
      () => setCatsFor({ key, rows: [] }),
    );
  }, [from, to]);
  // still loading while the result is for other dates
  const cats = catsFor?.key === `${from}:${to}` ? catsFor.rows : null;
  // who buys, by age, for the chosen dates
  const [ageFor, setAgeFor] = useState<{ key: string; data: AgeSales | null } | null>(null);
  useEffect(() => {
    const key = `${from}:${to}`;
    salesByAge(from, to).then(
      (data) => setAgeFor({ key, data }),
      () => setAgeFor({ key, data: null }),
    );
  }, [from, to]);
  const ages = ageFor?.key === `${from}:${to}` ? ageFor : null;

  // saved for later, all time (not tied to the date range)
  const [saved, setSaved] = useState<SavedProduct[] | null>(null);
  // failed deliveries recorded in the range (0039), under Shipped
  const [failed, setFailed] = useState<{ key: string; n: number } | null>(null);
  useEffect(() => {
    savedProducts().then(setSaved, () => setSaved([]));
  }, []);

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
    failedDeliveries(from, to).then(
      (n) => setFailed({ key: `${from}|${to}`, n }),
      () => {},
    );
  }, [from, to]);
  // GST paid on supplier bills (0050); an error here must not take the page down
  const [bills, setBills] = useState<{ key: string; rows?: ItcMonth[]; unpaid?: UnpaidBill[]; err?: string } | null>(null);
  useEffect(() => {
    const key = `${from}|${to}`;
    Promise.all([itc(from, to), unpaidBills(180)]).then(
      ([rows, unpaid]) => setBills({ key, rows, unpaid }),
      (e) => setBills({ key, err: errText(e) }),
    );
  }, [from, to]);
  const billsNow = bills?.key === `${from}|${to}` ? bills : null;
  const failedNow = failed?.key === `${from}|${to}` ? failed.n : 0;

  const a = cur;
  const b = prev;
  const net = (x: Analytics) => x.gross - x.returns;
  const aov = (x: Analytics) => (x.orders ? x.gross / x.orders : 0);
  const conv = (x: Analytics) => (x.sessions ? (x.orders / x.sessions) * 100 : 0);
  // of the visits that put something in the cart, the share that did not
  // end in an order (guests included: it is counted from visits, not accounts)
  const abandon = (x: Analytics) => (x.cart_sessions ? Math.max(0, 1 - x.orders / x.cart_sessions) * 100 : 0);
  const ret = (x: Analytics) => (x.customers ? (x.returning / x.customers) * 100 : 0);
  const margin = (x: Profit) => (x.costed_sales ? (x.profit / x.costed_sales) * 100 : 0);
  const label = rangeLabel(range);

  return (
    <CompareOff.Provider value={range.id === "all"}>
    <div className="anx">
      <h1 className="sr-only">Analytics</h1>
      {!ar && <AnalyticsTabs on="overview" />}
      <div className="anx-bar">
        {ar ? <ArPeriod value={range} onChange={(r) => (setErr(""), setRange(r))} /> : <RangePicker value={range} onChange={(r) => (setErr(""), setRange(r))} />}
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
              <LineChart columns height={282} label="Gross sales (incl. GST) per day" labels={days.map(dayLabel)} cur={a.daily.map((d) => d.gross)} prev={b.daily.map((d) => d.gross)} fmt={shortMoney} />
            </section>

            <div className="anx-kpis">
              <Kpi label="Orders" value={count(a.orders)} now={a.orders} before={b.orders} spark={a.daily.map((d) => d.orders)} />
              <Kpi label="Average order value (AOV)" value={money(Math.round(aov(a)))} now={aov(a)} before={aov(b)} spark={a.daily.map((d) => (d.orders ? d.gross / d.orders : 0))} />
              {pc.costed_sales ? (
                <Kpi
                  label="Net profit (after GST)"
                  value={money(Math.round(pc.kept))}
                  note={!pc.uncosted_lines && pc.net_sales ? `${pct((pc.kept / pc.net_sales) * 100)} margin on net sales` : `gross ${money(Math.round(pc.profit))}`}
                  now={pc.kept}
                  before={pp.kept}
                  spark={pc.daily.map((d) => d.profit)}
                />
              ) : (
                <a className="adm-card anx-kpi anx-kpi-empty" href="#profit">
                  <span className="anx-lab">Net profit (after GST)</span>
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
            <Stat label="Cart abandonment" value={a.cart_sessions ? pct(abandon(a)) : "–"} now={abandon(a)} before={abandon(b)} lowerIsBetter />
            <Stat label="Items sold" value={count(a.items)} now={a.items} before={b.items} />
            <Stat label="Shipped" value={count(a.fulfilled)} now={a.fulfilled} before={b.fulfilled} note={failedNow > 0 ? `${failedNow} failed deliver${failedNow === 1 ? "y" : "ies"}` : undefined} />
            <Stat label="Returning customers" value={pct(ret(a))} now={ret(a)} before={ret(b)} />
          </div>

          <div className="anx-three">
            <section className="adm-card">
              <h2>Sales breakdown</h2>
              <div className="adm-kv anx-kv">
                <span>Gross sales (at shelf price)</span>
                <span>{money(a.gross)}</span>
                <span>Returns</span>
                <span>{a.returns ? `−${money(a.returns)}` : money(0)}</span>
                <span>
                  <strong>Net sales (after returns)</strong>
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
          <div className="adm-pair">
            <section className="adm-card">
              <h2>Sales by category</h2>
              {cats === null ? (
                <p className="adm-muted adm-small">Loading.</p>
              ) : cats.length ? (
                <Bars rows={cats.map((c) => ({ name: c.name, value: c.sales }))} fmt={money} />
              ) : (
                <p className="adm-muted adm-small">No sales in these dates.</p>
              )}
            </section>
            <AgeCard ages={ages} />
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
              <h2>Profit &amp; GST summary</h2>
              <div className="adm-kv anx-kv">
                <span>Gross sales (incl. GST)</span>
                <span>{money(Math.round(pc.costed_sales))}</span>
                <span>Cost price (incl. GST)</span>
                <span>{pc.cost ? `−${money(Math.round(pc.cost))}` : money(0)}</span>
                <span>Gross profit (before paying GST)</span>
                <span>{money(Math.round(pc.profit))}</span>
                <span>Gross margin</span>
                <span>{pc.costed_sales ? pct(margin(pc)) : "–"}</span>
                <span>
                  <strong>Net profit (after GST)</strong>
                </span>
                <span>
                  <strong className={pc.kept < 0 ? "adm-profit-neg" : pc.kept > 0 ? "adm-profit-pos" : ""}>{money(Math.round(pc.kept))}</strong>
                </span>
                {pc.itc > 0 && (
                  <>
                    <span>Net profit if nothing were claimed back</span>
                    <span>{money(Math.round(pc.kept_no_itc))}</span>
                  </>
                )}
                <span>GST collected from buyers</span>
                <span>{money(Math.round(pc.gst_collected))}</span>
                {pc.cess_collected > 0 && (
                  <>
                    <span>Cess collected (paid over in full)</span>
                    <span>{money(Math.round(pc.cess_collected))}</span>
                  </>
                )}
                <span>GST paid to suppliers on what sold</span>
                <span>{money(Math.round(pc.gst_paid))}</span>
                <span>Claimed back (input tax credit)</span>
                <span>{pc.itc ? `−${money(Math.round(pc.itc))}` : money(0)}</span>
                <span className="tot">Net GST payable</span>
                <span className="tot">{money(Math.round(Math.max(0, pc.gst_owed)))}</span>
              </div>
              <p className="adm-muted adm-small anx-foot">
                {!pc.input_credit
                  ? "Nothing is claimed back: input tax credit is off in Settings, so all the GST collected is paid over and the GST paid to suppliers stays part of the cost."
                  : pc.itc < pc.gst_paid
                    ? `Of the ${money(Math.round(pc.gst_paid))} GST paid to suppliers, ${money(Math.round(pc.itc))} is claimed back: only bills from suppliers with a GSTIN count, and prices typed by hand count in full. The rest stays part of the cost.`
                    : `All ${money(Math.round(pc.gst_paid))} GST paid to suppliers is claimed back against the GST collected.`}
                {pc.estimated_gst_lines > 0 && ` For ${count(pc.estimated_gst_lines)} items sold before the GST paid was recorded, it is estimated at the selling rate.`}
              </p>
              <p className="adm-muted adm-small anx-foot">
                {pc.lines > 0 && pc.uncosted_lines === pc.lines
                  ? `None of the ${count(pc.lines)} items sold have a cost price yet. `
                  : pc.uncosted_lines > 0
                    ? `${count(pc.uncosted_lines)} of ${count(pc.lines)} items sold have no cost price, so profit counts the other ${count(pc.lines - pc.uncosted_lines)}. `
                    : ""}
                Profit is the selling price with GST less the cost price (purchase + GST paid to the supplier); &ldquo;Net profit (after GST)&rdquo; takes off the GST still owed on those sales, after what is claimed back. Cancelled and refunded orders and delivery are left out.
              </p>
            </section>
          </div>
          <section className="adm-card">
            <h2>Input tax credit (ITC)</h2>
            {!billsNow ? (
              <p className="adm-muted adm-small">Loading.</p>
            ) : billsNow.err ? (
              <p className="adm-err">Couldn&apos;t load the GST on supplier bills. {billsNow.err}</p>
            ) : (
              <>
                {(() => {
                  const rows = billsNow.rows ?? [];
                  const sum = (k: "on_bills" | "in_2b" | "cgst" | "sgst" | "igst") => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
                  const waiting = rows.reduce((t, r) => t + (Number(r.not_in_2b_bills) || 0), 0);
                  const unpaid = billsNow.unpaid ?? [];
                  const m2 = (n: number) => money(Math.round(n * 100) / 100);
                  return (
                    <>
                      <div className="adm-kv anx-kv">
                        <span className="tot">ITC available (bills in GSTR-2B)</span>
                        <span className="tot">{m2(sum("in_2b"))}</span>
                        <span>CGST</span>
                        <span>{m2(sum("cgst"))}</span>
                        <span>SGST</span>
                        <span>{m2(sum("sgst"))}</span>
                        <span>IGST</span>
                        <span>{m2(sum("igst"))}</span>
                        <span>GST on all supplier bills</span>
                        <span>{m2(sum("on_bills"))}</span>
                      </div>
                      {waiting > 0 && (
                        <p className="adm-muted adm-small">
                          {waiting} bill{waiting === 1 ? " isn't" : "s aren't"} ticked as in GSTR-2B yet; {waiting === 1 ? "its" : "their"} GST counts once ticked on the bill.
                        </p>
                      )}
                      {unpaid.length > 0 && (
                        <div className="adm-err">
                          <b>ITC to reverse: unpaid over 180 days</b>
                          {unpaid.map((u) => (
                            <div key={u.id}>
                              <Link href={`/admin/inventory/purchases/bill?id=${u.id}`}>
                                Bill {u.bill_no} · {u.supplier ?? "supplier"}
                              </Link>{" "}
                              · {u.days} days · {m2(Number(u.gst) || 0)} GST
                            </div>
                          ))}
                        </div>
                      )}
                      {rows.length > 0 && (
                        <div className="adm-kv anx-kv">
                          <span className="adm-muted adm-small">By month of bill</span>
                          <span />
                          {rows.map((r) => (
                            <Fragment key={r.month}>
                              <span>{MONTH.format(new Date(`${r.month}-01T12:00:00Z`))}</span>
                              <span>{m2(Number(r.in_2b) || 0)}</span>
                            </Fragment>
                          ))}
                        </div>
                      )}
                      {rows.length === 0 && <p className="adm-muted adm-small">No supplier bills in this range.</p>}
                    </>
                  );
                })()}
                <p className="adm-muted adm-small anx-foot">ITC available is what can be claimed on GSTR-3B: claimable bills ticked as in GSTR-2B. Opening stock and entries without a bill aren&apos;t included.</p>
              </>
            )}
          </section>
          <section className="adm-card">
            <div className="anx-card-head">
              <h2>Most wishlisted</h2>
              <span className="adm-muted adm-small">All time · signed-in customers</span>
            </div>
            {saved === null ? (
              <p className="adm-muted adm-small">Loading.</p>
            ) : saved.length ? (
              <Bars rows={saved.slice(0, 8).map((p) => ({ name: p.name, value: p.saves }))} fmt={(n) => `${count(n)} saved`} />
            ) : (
              <p className="adm-muted adm-small">No one has saved a product with the heart yet. Saves from signed-in customers show here.</p>
            )}
          </section>
          {pc.top.length > 0 && (
            <section className="adm-card">
              <h2>Most profitable products</h2>
              <Bars rows={pc.top.map((p) => ({ name: p.name, value: p.profit }))} fmt={money} />
            </section>
          )}

          {/* visits, sources, devices, pages and the conversion funnel are on Traffic */}
          <section className="adm-card anx-to-traffic">
            <h2>Visitors</h2>
            <p className="adm-muted adm-small" style={{ margin: 0 }}>
              {count(a.sessions)} visits in these dates. Where they came from, what they looked at, the devices and how many went on to order: <Link href="/admin/analytics/traffic">Traffic</Link>.
            </p>
          </section>
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

function Stat({ label, value, now, before, lowerIsBetter, note }: { label: string; value: string; now: number; before: number; lowerIsBetter?: boolean; note?: string }) {
  return (
    <div className="anx-stat">
      <div className="anx-lab">{label}</div>
      <div className="anx-stat-val">
        {value} <Delta now={now} before={before} lowerIsBetter={lowerIsBetter} />
      </div>
      {note && <div className="anx-stat-note">{note}</div>}
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

// Who buys, by age: sales in the dates per age band (from the date of birth
// asked at sign-up), how many orders and buyers each, and how many of all
// customer accounts are in each band
function AgeCard({ ages }: { ages: { data: AgeSales | null } | null }) {
  const d = ages?.data;
  const known = d ? d.bands.filter((b) => b.band !== "Age not given") : [];
  const unknown = d?.bands.find((b) => b.band === "Age not given");
  const accounts = d?.accounts ?? [];
  const told = accounts.filter((a) => a.band !== "Age not given").reduce((n, a) => n + a.n, 0);
  const all = accounts.reduce((n, a) => n + a.n, 0);
  return (
    <section className="adm-card">
      <h2>Sales by age</h2>
      {ages === null ? (
        <p className="adm-muted adm-small">Loading.</p>
      ) : !d ? (
        <p className="adm-muted adm-small">Couldn&apos;t load ages.</p>
      ) : (
        <>
          {known.length ? (
            <Bars rows={known.map((b) => ({ name: `${b.band} · ${b.orders} order${b.orders === 1 ? "" : "s"}`, value: b.sales }))} fmt={money} />
          ) : (
            <p className="adm-muted adm-small">No orders from customers with a date of birth in these dates yet.</p>
          )}
          <p className="adm-muted adm-small" style={{ marginTop: 10 }}>
            {unknown ? `${money(unknown.sales)} more from ${unknown.orders} order${unknown.orders === 1 ? "" : "s"} where the age isn't known (guests, older accounts). ` : ""}
            {all ? `${told} of ${all} customer accounts have a date of birth${told ? `: ${accounts.filter((a) => a.band !== "Age not given").map((a) => `${a.band} ${a.n}`).join(", ")}` : ""}.` : ""}
          </p>
        </>
      )}
    </section>
  );
}
