"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bars, money } from "@/components/admin/ui";
import { placeOf } from "@/lib/india-places";
import type { GeoCity } from "@/lib/orders-db";

// Analytics: where customers are. Each city is a point of light on a dark map:
// a bright core with a soft glow sized by the chosen measure. Glows that meet
// add up (screen blend), so busy regions read as brighter, not as a pile of
// rings. The biggest place pulses gently; hover a light for its name and
// numbers. Beside it: how spread out the business is, and the top places.
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
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // each city on the map: its pins' average when customers dropped pins, else the city list
  const placed = useMemo(
    () =>
      cities.map((c) => {
        const at: [number, number] | null = c.lat != null && c.lng != null ? [c.lat, c.lng] : (placeOf(c.city, c.state)?.at ?? null);
        return { ...c, at };
      }),
    [cities],
  );
  const fmt = (n: number) => (measure === "sales" ? money(Math.round(n)) : count(n));

  // the map itself, once
  useEffect(() => {
    let dead = false;
    import("leaflet").then((L) => {
      if (dead || !box.current || map.current) return;
      // India framed, no scroll-zoom; the +/- sit bottom-right, out of the way
      const m = L.map(box.current, {
        center: [22.6, 80],
        zoom: 4,
        minZoom: 4,
        maxZoom: 9,
        zoomSnap: 0.25,
        scrollWheelZoom: false,
        zoomControl: false,
        maxBounds: [
          [2, 62],
          [40, 100],
        ],
        maxBoundsViscosity: 0.8,
      });
      L.control.zoom({ position: "bottomright" }).addTo(m);
      // a plain dark base with no place names: the lights and our own labels carry it
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 16,
        attribution: "Esri, HERE, Garmin, &copy; OpenStreetMap",
      }).addTo(m);
      m.attributionControl.setPrefix(false);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // the lights, redrawn when the data or the measure changes
  useEffect(() => {
    if (!ready) return;
    import("leaflet").then((L) => {
      const m = map.current;
      const g = layer.current;
      if (!m || !g) return;
      g.clearLayers();
      const pts = placed.filter((p) => p.at);
      const max = Math.max(1, ...pts.map((p) => p[measure]));
      const sorted = [...pts].sort((a, b) => b[measure] - a[measure]);
      const size = (v: number) => Math.round(20 + 110 * Math.pow(v / max, 0.6)); // the glow
      const core = (v: number) => Math.round(4 + 8 * Math.pow(v / max, 0.6)); // the bright centre

      // smallest last, so small towns sit on top and stay hoverable
      sorted.forEach((p, i) => {
        const s = size(p[measure]);
        const c = core(p[measure]);
        L.marker(p.at!, {
          keyboard: false,
          icon: L.divIcon({
            className: `geo-light ${i === 0 ? "is-top" : ""}`,
            // they light up biggest first
            html: `<i class="geo-glow" style="width:${s}px;height:${s}px;--d:${i * 45}ms"></i><i class="geo-core" style="width:${c}px;height:${c}px;--d:${i * 45}ms"></i>`,
            iconSize: [s, s],
            iconAnchor: [s / 2, s / 2],
          }),
        })
          .bindTooltip(
            `<b>${p.city}</b><span>${p.state}</span><em>${count(p.customers)} customer${p.customers === 1 ? "" : "s"} · ${count(p.orders)} order${p.orders === 1 ? "" : "s"} · ${money(Math.round(p.sales))}</em>`,
            { direction: "top", offset: [0, -c], className: "geo-tip" },
          )
          .addTo(g);
      });

      // the card may have grown to the side panel's height since the map was made
      m.invalidateSize();
      if (pts.length) m.fitBounds(L.latLngBounds(pts.map((p) => p.at!)).pad(0.3), { maxZoom: 5.5, animate: false });

    });
  }, [ready, placed, measure]);

  // how spread out: places, and how much the biggest ones hold
  const total = placed.reduce((n, p) => n + p[measure], 0);
  const byCity = [...placed].sort((a, b) => b[measure] - a[measure]);
  const states = Object.values(
    placed.reduce<Record<string, { name: string; v: number }>>((acc, p) => {
      const k = p.state || "Unknown";
      (acc[k] ??= { name: k, v: 0 }).v += p[measure];
      return acc;
    }, {}),
  ).sort((a, b) => b.v - a.v);
  const top = byCity[0];
  const top3 = byCity.slice(0, 3).reduce((n, p) => n + p[measure], 0);
  const unplaced = placed.filter((p) => !p.at).length;

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
          <div className="geo-map" ref={box} role="img" aria-label={`Map of ${measure} by city`} />
          {/* what the size of a light means */}
          {total > 0 && (
            <div className="geo-key" aria-hidden="true">
              <span className="geo-key-lights">
                <i style={{ width: 8, height: 8 }} />
                <i style={{ width: 14, height: 14 }} />
              </span>
              <span>
                Bigger glow, more {measure}
                <br />
                <span className="adm-muted">largest: {byCity[0] ? short(byCity[0][measure], measure) : 0}</span>
              </span>
            </div>
          )}
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
              {unplaced > 0 && <p className="adm-muted adm-small">{unplaced} place{unplaced === 1 ? "" : "s"} not on the map (city and state not recognised).</p>}
            </>
          ) : (
            <p className="adm-empty">No orders in this period yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
