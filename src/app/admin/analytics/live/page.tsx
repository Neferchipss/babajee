"use client";

import { useEffect, useState } from "react";
import { AnalyticsTabs } from "@/components/admin/RangePicker";
import { money } from "@/components/admin/ui";
import { errText, liveView, type LiveSession, type LiveView } from "@/lib/orders-db";
import ArAnalyticsScreen from "@/components/admin/shells/AroniumAnalytics";
import { useAdminStyle } from "@/lib/admin-style";

// Analytics > Live view (0069): who is on the shop right now, refreshed every
// 15 seconds while the page is open and visible. Staff, admin pages and test
// accounts are never tracked, so they never show here.
const EVERY_MS = 15_000;

const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
};
const pageName = (p: string) => {
  const path = p.split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/") return "Home";
  if (path === "/cart") return "Cart";
  if (path.startsWith("/checkout")) return "Checkout";
  return path.replace(/^\/shop\//, "Shop › ").replace(/\//g, " › ");
};
const from = (s: LiveSession) => {
  if (s.campaign) return s.campaign.split("/")[0];
  if (!s.referrer) return "Direct";
  return s.referrer.replace(/^https?:\/\//, "").replace(/^(www|l|m|lm)\./, "").split("/")[0];
};

export default function LivePage() {
  return useAdminStyle() === "aronium" ? (
    <ArAnalyticsScreen kind="live">
      <LivePageOriginal ar />
    </ArAnalyticsScreen>
  ) : (
    <LivePageOriginal />
  );
}

function LivePageOriginal({ ar = false }: { ar?: boolean }) {
  const [data, setData] = useState<LiveView | null>(null);
  const [err, setErr] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    const load = () => {
      if (document.hidden) return;
      liveView(minutes).then(
        (d) => {
          if (stop) return;
          setData(d);
          setErr("");
          setNow(Date.now());
        },
        (e) => !stop && setErr(errText(e)),
      );
    };
    load();
    const t = window.setInterval(load, EVERY_MS);
    const vis = () => !document.hidden && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [minutes]);

  const carting = data?.sessions.filter((s) => s.adds > 0).length ?? 0;
  const checking = data?.sessions.filter((s) => s.checkout).length ?? 0;

  return (
    <div className="anx">
      <h1 className="sr-only">Live view</h1>
      {!ar && <AnalyticsTabs on="live" />}
      <div className="anx-bar live-bar">
        <span className="live-dot" aria-hidden /> <span className="adm-small">Live · refreshes every 15 seconds</span>
        <select className="adm-input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Counting visitors active in">
          <option value={5}>Active in the last 5 minutes</option>
          <option value={15}>Last 15 minutes</option>
          <option value={30}>Last 30 minutes</option>
        </select>
      </div>
      {err && <p className="adm-err">{err}</p>}

      <div className="live-stats">
        <div className="adm-card"><b>{data?.visitors ?? "–"}</b><span>on the shop now</span></div>
        <div className="adm-card"><b>{data ? carting : "–"}</b><span>with something in their cart</span></div>
        <div className="adm-card"><b>{data ? checking : "–"}</b><span>at checkout</span></div>
        <div className="adm-card"><b>{data?.today.visits ?? "–"}</b><span>visits today</span></div>
        <div className="adm-card"><b>{data?.today.orders ?? "–"}</b><span>orders today</span></div>
        <div className="adm-card"><b>{data ? money(data.today.sales) : "–"}</b><span>paid sales today</span></div>
      </div>

      <div className="live-grid">
        <section className="adm-card adm-tablecard">
          <h2 className="live-h">Visitors</h2>
          {!data ? (
            <p className="adm-empty">Loading.</p>
          ) : !data.sessions.length ? (
            <p className="adm-empty">Nobody on the shop in the last {data.minutes} minutes.</p>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>On</th>
                  <th data-hide-sm>From</th>
                  <th data-hide-sm>Device</th>
                  <th className="num">Pages</th>
                  <th>Cart</th>
                  <th data-hide-sm>Seen</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.session}>
                    <td>
                      <div>{pageName(s.page)}</div>
                      {s.looking_at && <div className="adm-muted adm-small">Looking at {s.looking_at}</div>}
                      {s.customer && <div className="adm-small">{s.customer}</div>}
                    </td>
                    <td data-hide-sm className="adm-small">{from(s)}</td>
                    <td data-hide-sm className="adm-small">{s.device || "–"}</td>
                    <td className="num">{s.pages}</td>
                    <td className="adm-small">{s.checkout ? <span className="adm-pill">At checkout</span> : s.adds > 0 ? `${s.adds} added` : "–"}</td>
                    <td data-hide-sm className="adm-muted adm-small">{ago(s.last_at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="adm-card">
          <h2 className="live-h">Pages open now</h2>
          {!data?.pages.length ? (
            <p className="adm-muted adm-small">None.</p>
          ) : (
            <ul className="live-pages">
              {data.pages.map((p) => (
                <li key={p.page}>
                  <span>{pageName(p.page)}</span>
                  <b>{p.visitors}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
