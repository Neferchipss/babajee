"use client";

import { useEffect, useMemo, useState } from "react";
import { money, when } from "@/components/admin/ui";
import { listCategories } from "@/lib/admin-data";
import { customerActivity, type ActivityEvent, type CustomerActivity as Activity, type CustomerSaved, type Order } from "@/lib/orders-db";

// What one signed-in customer did on the site, newest first: products they
// opened, what they added to the cart, pages they browsed, when they reached
// checkout, mixed with their orders and saves. Grouped by visit, each with
// its device and where the visit came from. Recorded since migration 0036;
// only while signed in (and the same visit's earlier steps).
type Row = { at: string; text: string; visit?: string; strong?: boolean };
type Visit = { key: string; at: string; device: string; referrer: string; rows: Row[] };

const SHOWN = 8; // visits shown before "Show all"

const PAGES: [RegExp, string][] = [
  [/^\/$/, "Home"],
  [/^\/shop$/, "Browsed all products"],
  [/^\/shop\/search/, "Searched the shop"],
  [/^\/cart/, "Looked at the cart"],
  [/^\/checkout/, "Opened checkout"],
  [/^\/account\/orders|^\/orders/, "Looked at their orders"],
  [/^\/account/, "Opened their account"],
  [/^\/wishlist|^\/saved/, "Looked at saved products"],
];

const titleCase = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function describe(e: ActivityEvent, cats: Map<string, string>): string | null {
  if (e.kind === "product") return `Opened ${e.label || "a product"}`;
  if (e.kind === "add") return `Added ${e.label || "a product"} to the cart`;
  if (e.kind === "checkout") return "Reached checkout";
  if (e.kind === "cart") return null; // the per-product "add" rows say it better
  const path = e.path.split("?")[0] || "/";
  const shelf = path.match(/^\/shop\/([^/]+)$/);
  if (shelf && shelf[1] !== "search") return `Browsed ${cats.get(shelf[1]) ?? titleCase(shelf[1])}`;
  for (const [re, text] of PAGES) if (re.test(path)) return text;
  return `Visited ${path}`;
}

const from = (ref: string) => (ref ? `from ${ref}` : "came directly");
const deviceName = (d: string) => (d ? d[0].toUpperCase() + d.slice(1) : "");

export default function CustomerActivity({ id, orders, saved }: { id: string; orders: Order[]; saved: CustomerSaved[] }) {
  const [data, setData] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);
  const [cats, setCats] = useState<Map<string, string>>(new Map());
  const [all, setAll] = useState(false);

  useEffect(() => {
    customerActivity(id).then(setData, () => setFailed(true));
    listCategories().then(
      (list) => setCats(new Map(list.map((c) => [c.slug, c.name]))),
      () => {},
    );
  }, [id]);

  // events grouped into visits (newest first), with orders and saves placed
  // in the visit they happened in, or on their own when outside any visit
  const visits = useMemo<Visit[]>(() => {
    if (!data) return [];
    const byVisit = new Map<string, Visit>();
    for (const e of data.events) {
      const text = describe(e, cats);
      let v = byVisit.get(e.visit);
      if (!v) {
        v = { key: e.visit, at: e.at, device: e.device, referrer: e.referrer, rows: [] };
        byVisit.set(e.visit, v);
      }
      // the visit's first step carries where it came from
      if (e.referrer) v.referrer = e.referrer;
      if (!text) continue;
      const last = v.rows[v.rows.length - 1];
      if (last && last.text === text) continue; // the same thing twice in a row
      v.rows.push({ at: e.at, text });
    }
    const list = [...byVisit.values()];
    const extras: Row[] = [
      ...orders.map((o) => ({ at: o.created_at, text: `Placed order ${o.order_number} · ${money(o.total)}`, strong: true })),
      ...saved.map((s) => ({ at: s.saved_at, text: `Saved ${s.name} for later` })),
    ];
    for (const x of extras) {
      const t = new Date(x.at).getTime();
      // the visit whose time span holds it (rows are newest first)
      const home = list.find((v) => {
        const times = v.rows.map((r) => new Date(r.at).getTime());
        if (!times.length) return false;
        return t <= Math.max(...times) + 10 * 60e3 && t >= Math.min(...times) - 10 * 60e3;
      });
      if (home) home.rows.push(x);
      else list.push({ key: `x-${x.at}`, at: x.at, device: "", referrer: "", rows: [x] });
    }
    for (const v of list) {
      v.rows.sort((a, b) => b.at.localeCompare(a.at));
      v.at = v.rows[0]?.at ?? v.at;
    }
    return list.filter((v) => v.rows.length).sort((a, b) => b.at.localeCompare(a.at));
  }, [data, cats, orders, saved]);

  const shown = all ? visits : visits.slice(0, SHOWN);

  return (
    <section className="adm-card">
      <h2>Activity</h2>
      {failed ? (
        <p className="adm-muted adm-small">Activity could not be loaded.</p>
      ) : !data ? (
        <p className="adm-muted adm-small">Loading.</p>
      ) : (
        <>
          <dl className="cact-facts">
            <div>
              <dt>First found the shop</dt>
              <dd>{data.first ? `${when(data.first.at)}, ${from(data.first.referrer)}${data.first.device ? ` on ${data.first.device}` : ""}` : "Not recorded yet"}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{data.last_seen ? when(data.last_seen) : "Not recorded yet"}</dd>
            </div>
            <div>
              <dt>Visits</dt>
              <dd>{data.visits}</dd>
            </div>
          </dl>
          {!visits.length ? (
            <p className="adm-muted adm-small">Nothing yet. Their visits show here once they browse the shop while signed in.</p>
          ) : (
            <ol className="cact-visits">
              {shown.map((v) => (
                <li key={v.key}>
                  <p className="cact-visit">
                    {when(v.at)}
                    {v.device && <span> · {deviceName(v.device)}</span>}
                    {!v.key.startsWith("x-") && <span> · {from(v.referrer)}</span>}
                  </p>
                  <ul>
                    {v.rows.map((r, i) => (
                      <li key={`${r.at}-${i}`} className={r.strong ? "is-strong" : ""}>
                        <span>{r.text}</span>
                        <time dateTime={r.at}>{new Date(r.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</time>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {visits.length > SHOWN && (
            <button type="button" className="adm-btn" onClick={() => setAll((x) => !x)} style={{ marginTop: 12 }}>
              {all ? "Show fewer" : `Show all ${visits.length} visits`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
