"use client";

import { useMemo, useState } from "react";
import { Bars, money } from "@/components/admin/ui";
import india from "@/lib/india-states.json";
import type { GeoCity } from "@/lib/orders-db";

// Analytics: where customers are. India's states, shaded in the brass gold by
// the chosen measure in five steps (deeper is more); states with nothing stay
// dark. Hover or tap a state for its numbers. Drawn as SVG from DataMeet's
// boundaries (src/lib/india-states.json, made by tools/india_states.py), so
// there are no map tiles to load. Beside it: how spread out the business is,
// and the top places.
type Measure = "customers" | "orders" | "sales";
const MEASURES: { id: Measure; label: string }[] = [
  { id: "customers", label: "Customers" },
  { id: "orders", label: "Orders" },
  { id: "sales", label: "Sales" },
];
const count = (n: number) => Math.round(n).toLocaleString("en-IN");
const pct = (n: number) => `${Math.round(n)}%`;
const short = (n: number, m: Measure) => (m !== "sales" ? count(n) : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${Math.round(n)}`);

export default function CustomerMap({ cities, customers }: { cities: GeoCity[]; customers: number }) {
  const [measure, setMeasure] = useState<Measure>("customers");
  const [listBy, setListBy] = useState<"cities" | "states">("cities");
  const [hover, setHover] = useState<string | null>(null);

  // each city with its state's map name; totals per state for the shading
  const placed = useMemo(() => cities.map((c) => ({ ...c, mapState: stateKey(c.state) })), [cities]);
  const fmt = (n: number) => (measure === "sales" ? money(Math.round(n)) : count(n));
  const byState = useMemo(() => {
    const m = new Map<string, { customers: number; orders: number; sales: number; cities: number }>();
    for (const c of placed) {
      if (!c.mapState) continue;
      const t = m.get(c.mapState) ?? { customers: 0, orders: 0, sales: 0, cities: 0 };
      m.set(c.mapState, { customers: t.customers + c.customers, orders: t.orders + c.orders, sales: t.sales + c.sales, cities: t.cities + 1 });
    }
    return m;
  }, [placed]);
  const maxState = Math.max(1, ...[...byState.values()].map((v) => v[measure]));
  // five steps of the gold, by share of the busiest state
  const step = (v: number) => (v <= 0 ? -1 : Math.min(4, Math.floor((v / maxState) * 5 - 1e-9)));
  const SHADE = [0.34, 0.5, 0.66, 0.82, 1];
  const shown = hover ? byState.get(hover) : undefined;

  // how spread out: places, and how much the biggest ones hold
  const total = placed.reduce((n, p) => n + p[measure], 0);
  const byCity = [...placed].sort((a, b) => b[measure] - a[measure]);
  const states = Object.values(
    placed.reduce<Record<string, { name: string; v: number }>>((acc, p) => {
      const k = p.mapState ?? (p.state || "Unknown");
      (acc[k] ??= { name: k, v: 0 }).v += p[measure];
      return acc;
    }, {}),
  ).sort((a, b) => b.v - a.v);
  const top = byCity[0];
  const top3 = byCity.slice(0, 3).reduce((n, p) => n + p[measure], 0);
  const unplaced = placed.filter((p) => !p.mapState).length;

  return (
    <section className="adm-card geo">
      <div className="geo-head">
        <div>
          <h2>Where customers are</h2>
          <p className="adm-muted adm-small">
            {count(customers)} customer{customers === 1 ? "" : "s"} across {placed.length} cit{placed.length === 1 ? "y" : "ies"} in {states.length} state{states.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="adm-chips" role="group" aria-label="Size by">
          {MEASURES.map((m) => (
            <button key={m.id} type="button" className={`adm-chip ${measure === m.id ? "is-on" : ""}`} aria-pressed={measure === m.id} onClick={() => setMeasure(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="geo-body">
        <div className="geo-mapbox">
          <svg className="geo-svg" viewBox={`0 0 ${india.w} ${india.h}`} role="img" aria-label={`Map of India, states shaded by ${measure}`} onMouseLeave={() => setHover(null)}>
            {india.states.map((st) => {
              const v = byState.get(st.name)?.[measure] ?? 0;
              const k = step(v);
              return (
                <path
                  key={st.name}
                  d={st.d}
                  className={`geo-state ${k < 0 ? "is-empty" : ""} ${hover === st.name ? "is-hover" : ""}`}
                  style={k < 0 ? undefined : { fillOpacity: SHADE[k] }}
                  onMouseEnter={() => setHover(st.name)}
                  onClick={() => setHover(st.name)}
                >
                  <title>{`${st.name}: ${v ? fmt(v) : "none"}`}</title>
                </path>
              );
            })}
          </svg>
          {/* the state under the pointer, or a hint */}
          <div className="geo-readout" aria-live="polite">
            {hover ? (
              <>
                <b>{hover}</b>
                {shown ? (
                  <span>
                    {count(shown.customers)} customer{shown.customers === 1 ? "" : "s"} · {count(shown.orders)} order{shown.orders === 1 ? "" : "s"} · {money(Math.round(shown.sales))}
                    <br />
                    <span className="adm-muted">
                      {shown.cities} cit{shown.cities === 1 ? "y" : "ies"} · {pct(total ? (shown[measure] / total) * 100 : 0)} of {measure}
                    </span>
                  </span>
                ) : (
                  <span className="adm-muted">No {measure} yet</span>
                )}
              </>
            ) : (
              <span className="adm-muted">Point at a state for its numbers</span>
            )}
          </div>
          {total > 0 && (
            <div className="geo-key" aria-hidden="true">
              <span className="geo-key-steps">
                {SHADE.map((o, i) => (
                  <i key={i} style={{ opacity: o }} />
                ))}
              </span>
              <span className="geo-key-ends">
                <span>less</span>
                <span>
                  more {measure} · top {short(maxState, measure)}
                </span>
              </span>
            </div>
          )}
          <span className="geo-credit">Boundaries: DataMeet</span>
        </div>
        <div className="geo-side">
          {total > 0 ? (
            <>
              <div className="geo-stats">
                <div>
                  <span className="anx-lab">Biggest city</span>
                  <b>{top.city}</b>
                  <span className="adm-muted adm-small">{pct((top[measure] / total) * 100)} of {measure}</span>
                </div>
                <div>
                  <span className="anx-lab">Outside the top 3</span>
                  <b>{pct(((total - top3) / total) * 100)}</b>
                  <span className="adm-muted adm-small">of {measure}</span>
                </div>
              </div>
              <div className="geo-list-head">
                <div className="adm-seg" role="group" aria-label="List by">
                  <button type="button" className={listBy === "cities" ? "is-on" : ""} aria-pressed={listBy === "cities"} onClick={() => setListBy("cities")}>
                    Top cities
                  </button>
                  <button type="button" className={listBy === "states" ? "is-on" : ""} aria-pressed={listBy === "states"} onClick={() => setListBy("states")}>
                    Top states
                  </button>
                </div>
              </div>
              <Bars rows={listBy === "cities" ? byCity.slice(0, 6).map((p) => ({ name: p.city, value: p[measure] })) : states.slice(0, 6).map((x) => ({ name: x.name, value: x.v }))} fmt={fmt} />
              {unplaced > 0 && <p className="adm-muted adm-small">{unplaced} place{unplaced === 1 ? "" : "s"} not on the map (state not recognised).</p>}
            </>
          ) : (
            <p className="adm-empty">No orders in this period yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// an order's state as the map names it (case, "&" and the merged UTs tolerated)
const MAP_NAMES = new Map(india.states.map((st) => [canon(st.name), st.name]));
const ALIAS: Record<string, string> = {
  "nct of delhi": "Delhi",
  "new delhi": "Delhi",
  ladakh: "Jammu and Kashmir",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  "andaman and nicobar": "Andaman and Nicobar Islands",
};
function canon(s: string) {
  return s.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
}
function stateKey(state: string): string | null {
  const c = canon(state || "");
  return MAP_NAMES.get(c) ?? ALIAS[c] ?? null;
}
