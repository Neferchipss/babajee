"use client";

import { useMemo, useRef, useState } from "react";
import { Bars, money } from "@/components/admin/ui";
import india from "@/lib/india-states.json";
import { placeOf } from "@/lib/india-places";
import type { GeoCity } from "@/lib/orders-db";

// Analytics: where customers are. India's states, shaded in the brass gold by
// the chosen measure in five steps (deeper is more); states with nothing stay
// dark. Hover a state for its numbers; click or tap it to zoom in on it, its
// cities marked, with the side panel switched to that state. Drawn as SVG from DataMeet's
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
  // where the card sits, in px inside the map box
  const [at, setAt] = useState<{ x: number; y: number; left: boolean; up: boolean } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const local = (cx: number, cy: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return null;
    const x = cx - r.left;
    const y = cy - r.top;
    // flip away from the right and bottom edges
    return { x, y, left: x > r.width - 262, up: y > r.height - 200 };
  };
  // keyboard and tap: the card sits over the state's middle
  const centreOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return local(r.left + r.width / 2, r.top + r.height / 2);
  };
  const clear = () => {
    setHover(null);
    setAt(null);
  };
  // the state zoomed into, and the frame that fits it (viewBox units)
  const [focus, setFocus] = useState<{ name: string; tx: number; ty: number; k: number } | null>(null);
  const zoomTo = (name: string, el: SVGGraphicsElement) => {
    const b = el.getBBox();
    const k = Math.min(8, 0.82 * Math.min(india.w / b.width, india.h / b.height));
    setFocus({ name, k, tx: india.w / 2 - k * (b.x + b.width / 2), ty: india.h / 2 - k * (b.y + b.height / 2) });
    clear();
  };
  const back = () => setFocus(null);

  // each city with its state's map name; totals per state for the shading
  const placed = useMemo(
    () =>
      cities.map((c) => {
        const ll = c.lat != null && c.lng != null ? [c.lat, c.lng] : placeOf(c.city, c.state)?.at;
        const { lng0, lat0, kx, ky } = india.proj;
        return { ...c, mapState: stateKey(c.state), xy: ll ? ([(ll[1] - lng0) * kx, (lat0 - ll[0]) * ky] as const) : null };
      }),
    [cities],
  );
  const fmt = (n: number) => (measure === "sales" ? money(Math.round(n)) : count(n));
  const byState = useMemo(() => {
    type T = { customers: number; orders: number; sales: number; cities: number; list: { city: string; customers: number; orders: number; sales: number; xy: readonly [number, number] | null }[] };
    const m = new Map<string, T>();
    for (const c of placed) {
      if (!c.mapState) continue;
      const t = m.get(c.mapState) ?? { customers: 0, orders: 0, sales: 0, cities: 0, list: [] };
      m.set(c.mapState, { customers: t.customers + c.customers, orders: t.orders + c.orders, sales: t.sales + c.sales, cities: t.cities + 1, list: [...t.list, c] });
    }
    return m;
  }, [placed]);
  const maxState = Math.max(1, ...[...byState.values()].map((v) => v[measure]));
  // five steps of the gold, by share of the busiest state
  const step = (v: number) => (v <= 0 ? -1 : Math.min(4, Math.floor((v / maxState) * 5 - 1e-9)));
  const SHADE = [0.34, 0.5, 0.66, 0.82, 1];
  const shown = hover ? byState.get(hover) : undefined;
  const hoverPath = hover ? india.states.find((st) => st.name === hover)?.d : undefined;
  const focusPath = focus ? india.states.find((st) => st.name === focus.name)?.d : undefined;
  const fs = focus ? byState.get(focus.name) : undefined;
  const fsCities = fs ? [...fs.list].sort((a, b) => b[measure] - a[measure]) : [];
  const fsMax = Math.max(1, ...fsCities.map((c) => c[measure]));

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
        <div className="geo-mapbox" ref={boxRef}>
          <svg
            className={`geo-svg ${hover ? "has-hover" : ""} ${focus ? "has-focus" : ""}`}
            viewBox={`0 0 ${india.w} ${india.h}`}
            role="img"
            aria-label={`Map of India, states shaded by ${measure}`}
            onPointerLeave={(e) => e.pointerType === "mouse" && clear()}
          >
            {/* a click on the sea goes back to all of India */}
            <rect width={india.w} height={india.h} fill="transparent" onClick={back} />
            <g className="geo-zoom" style={{ transform: focus ? `translate(${focus.tx}px, ${focus.ty}px) scale(${focus.k})` : "none" }}>
            {india.states.map((st) => {
              const v = byState.get(st.name)?.[measure] ?? 0;
              const k = step(v);
              return (
                <path
                  key={st.name}
                  d={st.d}
                  tabIndex={0}
                  aria-label={`${st.name}: ${v ? fmt(v) : "none"}`}
                  className={`geo-state ${k < 0 ? "is-empty" : ""} ${hover === st.name ? "is-hover" : ""} ${focus?.name === st.name ? "is-focus" : ""}`}
                  style={k < 0 ? undefined : { fillOpacity: SHADE[k] }}
                  onPointerMove={(e) => {
                    // no card over the state already zoomed into: the side panel has it
                    if (e.pointerType !== "mouse" || focus?.name === st.name) return hover && clear();
                    if (hover !== st.name) setHover(st.name);
                    setAt(local(e.clientX, e.clientY));
                  }}
                  onClick={(e) => (focus?.name === st.name ? back() : zoomTo(st.name, e.currentTarget))}
                  onFocus={(e) => {
                    if (hover === st.name || focus?.name === st.name) return;
                    setHover(st.name);
                    setAt(centreOf(e.currentTarget));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      zoomTo(st.name, e.currentTarget);
                    }
                    if (e.key === "Escape") {
                      e.currentTarget.blur();
                      clear();
                      back();
                    }
                  }}
                />
              );
            })}
            {/* the state in hand, redrawn on top so its whole outline shows */}
            {focusPath && <path className="geo-state-ring" d={focusPath} />}
            {hoverPath && <path key={hover} className={`geo-state-lift ${shown ? "" : "is-empty"}`} d={hoverPath} style={{ fillOpacity: shown ? SHADE[step(shown[measure])] : 0.12 }} />}
            {/* the zoomed state's cities: a dot sized by the measure, its name and figure */}
            {focus &&
              fsCities
                .filter((c) => c.xy)
                .map((c, i, all) => {
                  // a city sitting on a bigger one keeps its dot but not its label (the side list names it)
                  const crowded = all.slice(0, i).some((o) => Math.abs(o.xy![0] - c.xy![0]) < 150 / focus.k && Math.abs(o.xy![1] - c.xy![1]) < 36 / focus.k);
                  const r = (8 + 18 * Math.sqrt(c[measure] / fsMax)) / focus.k; // the map draws at about half size
                  return (
                    <g key={c.city} className="geo-city" style={{ animationDelay: `${180 + i * 40}ms` }} transform={`translate(${c.xy![0]} ${c.xy![1]})`}>
                      <circle r={r} />
                      {!crowded && <text x={r + 9 / focus.k} y={8 / focus.k} style={{ fontSize: 25 / focus.k }}>
                        {c.city} <tspan>{short(c[measure], measure)}</tspan>
                      </text>}
                    </g>
                  );
                })}
            </g>
          </svg>
          {focus && (
            <button type="button" className="geo-back" onClick={back}>
              ← All of India
            </button>
          )}
          {/* the state under the pointer: a card that follows it, flipping away from the edges */}
          {hover && at && (
            <div
              className="geo-card"
              role="status"
              style={{
                left: at.x,
                top: at.y,
                transform: `translate(${at.left ? "calc(-100% - 16px)" : "16px"}, ${at.up ? "calc(-100% - 12px)" : "12px"})`,
              }}
            >
              <b className="geo-card-name">{hover}</b>
              {shown ? (
                <>
                  <span className="geo-card-big">
                    {fmt(shown[measure])} <span className="adm-muted">{measure}</span>
                  </span>
                  <span className="geo-card-share">
                    <i style={{ width: `${total ? (shown[measure] / total) * 100 : 0}%` }} />
                  </span>
                  <span className="adm-muted">{pct(total ? (shown[measure] / total) * 100 : 0)} of all {measure}</span>
                  <dl className="geo-card-rest">
                    {MEASURES.filter((m) => m.id !== measure).map((m) => (
                      <div key={m.id}>
                        <dt>{m.label}</dt>
                        <dd>{m.id === "sales" ? money(Math.round(shown.sales)) : count(shown[m.id])}</dd>
                      </div>
                    ))}
                  </dl>
                  <span className="geo-card-cities">
                    {[...shown.list]
                      .sort((x, y) => y[measure] - x[measure])
                      .slice(0, 3)
                      .map((c) => `${c.city} ${short(c[measure], measure)}`)
                      .join(" · ")}
                    {shown.cities > 3 ? ` · +${shown.cities - 3} more` : ""}
                  </span>
                </>
              ) : (
                <span className="adm-muted">No {measure} yet</span>
              )}
            </div>
          )}
          {!hover && !focus && <span className="geo-hint">Point at a state, click to zoom in</span>}
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
          {focus ? (
            <>
              <div className="geo-focus-head">
                <span className="anx-lab">State</span>
                <b>{focus.name}</b>
                <span className="adm-muted adm-small">
                  {fs ? `${pct(total ? (fs[measure] / total) * 100 : 0)} of all ${measure} · ${fs.cities} cit${fs.cities === 1 ? "y" : "ies"}` : `No ${measure} in this period`}
                </span>
              </div>
              <div className="geo-stats geo-stats-3">
                {MEASURES.map((m) => (
                  <div key={m.id} className={m.id === measure ? "is-on" : ""}>
                    <span className="anx-lab">{m.label}</span>
                    <b>{fs ? (m.id === "sales" ? short(fs.sales, "sales") : count(fs[m.id])) : 0}</b>
                  </div>
                ))}
              </div>
              <h3 className="geo-sub">Cities</h3>
              <Bars rows={fsCities.slice(0, 8).map((c) => ({ name: c.city, value: c[measure] }))} fmt={fmt} empty="No cities yet." />
              {fsCities.length > 8 && <p className="adm-muted adm-small">+{fsCities.length - 8} more cities</p>}
            </>
          ) : total > 0 ? (
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
  // the outline predates the 2019 split, so both UTs share one shape
  "jammu and kashmir": "Jammu, Kashmir and Ladakh",
  ladakh: "Jammu, Kashmir and Ladakh",
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
