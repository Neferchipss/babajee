"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

// A small map with the pin the customer dropped on their door when they saved
// the address (see address/MapPin.tsx), for whoever packs and delivers. Drag or
// zoom to look around; "Open in Google Maps" gives directions.
export default function AddressMap({ lat, lng, label }: { lat: number | null | undefined; lng: number | null | undefined; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const has = typeof lat === "number" && typeof lng === "number";

  useEffect(() => {
    if (!has || !box.current) return;
    let dead = false;
    let remove = () => {};
    import("leaflet").then((L) => {
      if (dead || !box.current) return;
      const m = L.map(box.current, { center: [lat, lng], zoom: 16, zoomControl: true, scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      m.attributionControl.setPrefix(false);
      L.marker([lat, lng], {
        icon: L.divIcon({ className: "adm-pin", html: "<i></i>", iconSize: [28, 36], iconAnchor: [14, 34] }),
        title: label,
        keyboard: false,
      }).addTo(m);
      remove = () => m.remove();
    });
    return () => {
      dead = true;
      remove();
    };
  }, [has, lat, lng, label]);

  if (!has) return <p className="adm-muted adm-small adm-map-none">No map pin saved with this address.</p>;
  return (
    <div className="adm-map">
      <div ref={box} className="adm-map-box" role="img" aria-label={`Map pin for ${label}`} />
      <a className="adm-small" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer">
        Open in Google Maps ↗
      </a>
    </div>
  );
}
