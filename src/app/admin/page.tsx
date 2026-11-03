"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Delta, money, StatusPill, when } from "@/components/admin/ui";
import { analytics, errText, homeCounts, listOrders, type Analytics, type HomeCounts, type Order } from "@/lib/orders-db";
import { isoDay } from "@/lib/dates";

// Admin home: today's numbers against yesterday, the work waiting on the
// shop, and the latest orders.
export default function AdminHome() {
  const [counts, setCounts] = useState<HomeCounts | null>(null);
  const [today, setToday] = useState<Analytics | null>(null);
  const [yday, setYday] = useState<Analytics | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    const t = isoDay(0);
    const y = isoDay(-1);
    Promise.all([homeCounts(), analytics(t, t), analytics(y, y), listOrders()])
      .then(([c, a, b, o]) => {
        setCounts(c);
        setToday(a);
        setYday(b);
        setRecent(o.slice(0, 6));
      })
      .catch((e) => setErr(errText(e)));
  }, []);

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const tasks: [number | undefined, string, string][] = counts
    ? [
        [counts.unpaid, "orders waiting for payment", "/admin/orders?tab=pending"],
        [counts.to_pack, "paid orders to pack", "/admin/orders?tab=paid"],
        [counts.to_ship, "packed orders to ship", "/admin/orders?tab=packed"],
        [counts.in_transit, "orders on their way", "/admin/orders?tab=shipped"],
        [counts.out_of_stock, "tracked options out of stock", "/admin/products?need=out"],
        [counts.low_stock, "tracked options with 3 or fewer left", "/admin/products?need=low"],
        [counts.unpriced, "options with no price, which can't be ordered", "/admin/products"],
      ]
    : [];

  return (
    <div>
      <h1 className="sr-only">{hello}</h1>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-metrics five" style={{ marginBottom: 16 }}>
        <Metric label="Sales" now={today?.gross} before={yday?.gross} fmt={money} />
        <Metric label="Orders" now={today?.orders} before={yday?.orders} />
        <Metric label="Visitors" now={today?.sessions} before={yday?.sessions} />
        <Metric
          label="Conversion"
          now={today && today.sessions ? (today.orders / today.sessions) * 100 : undefined}
          before={yday && yday.sessions ? (yday.orders / yday.sessions) * 100 : undefined}
          fmt={(n) => `${n.toFixed(1)}%`}
        />
        <Link href="/admin/analytics" className="adm-metric adm-metric-link">
          <span className="lab">Today vs yesterday</span>
          <span className="go">Full analytics →</span>
        </Link>
      </div>

      <div className="adm-two">
        <section className="adm-card">
          <h2>Things to do</h2>
          {!counts ? (
            <p className="adm-muted">Loading.</p>
          ) : (
            <div className="adm-tasks">
              {tasks.map(([n, text, href]) => (
                <Link key={href + text} href={href} className={`adm-task ${n ? "" : "is-zero"}`}>
                  <b>{n ?? 0}</b>
                  <span>{text}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="adm-card">
          <header>
            <h2>Latest orders</h2>
            <Link href="/admin/orders">All orders</Link>
          </header>
          {recent.length === 0 ? (
            <p className="adm-muted adm-small">No orders yet. They appear here the moment a customer checks out.</p>
          ) : (
            <div className="adm-tasks">
              {recent.map((o) => (
                <Link key={o.id} href={`/admin/orders/view?id=${o.id}`} className="adm-task">
                  <span>
                    <strong>{o.order_number}</strong> · {o.contact_name}
                    <br />
                    <small className="adm-muted">
                      {when(o.created_at)} · {money(o.total)}
                    </small>
                  </span>
                  <StatusPill status={o.status} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, now, before, fmt = (n: number) => n.toLocaleString("en-IN") }: { label: string; now?: number; before?: number; fmt?: (n: number) => string }) {
  return (
    <div className="adm-metric">
      <div className="lab">{label}</div>
      <div className="val">
        {now === undefined ? "–" : fmt(now)}
        {now !== undefined && before !== undefined && <Delta now={now} before={before} />}
      </div>
    </div>
  );
}
