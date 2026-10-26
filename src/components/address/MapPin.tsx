"use client";

import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findPlace, placeAt, type Pin, type Place } from "@/lib/addresses";
import "./map-pin.css";

// India, zoomed out, while we find the customer.
const INDIA: Pin = { lat: 22.5, lng: 79 };
const STREET_ZOOM = 17;

type Props = {
  start: Pin | null;
  onConfirm: (pin: Pin, place: Place | null) => void;
  onClose: () => void;
};

// Full-screen map with a pin fixed in the middle: drag the map until the pin
// sits on the door, then confirm. The area under the pin is looked up as the
// map settles, and fills in city, state and PIN code on the form.
export default function MapPin({ start, onConfirm, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [pin, setPin] = useState<Pin>(start ?? INDIA);
  const [zoomedIn, setZoomedIn] = useState(!!start);
  const [moving, setMoving] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [looking, setLooking] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(Pin & { name: string })[]>([]);
  const [searching, setSearching] = useState(false);

  const fly = (to: Pin) => map.current?.setView([to.lat, to.lng], STREET_ZOOM, { animate: true });

  const locate = () => {
    if (!("geolocation" in navigator)) return setNote("This browser can't share your location. Search instead.");
    setLocating(true);
    setNote("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        fly({ lat: coords.latitude, lng: coords.longitude });
      },
      (err) => {
        setLocating(false);
        setNote(
          err.code === err.PERMISSION_DENIED
            ? "Location is off for this site. Search for your area, or drag the map."
            : "We couldn't find you. Search for your area, or drag the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60 * 1000 },
    );
  };

  // build the map once; Leaflet needs the window, so it loads here
  useEffect(() => {
    let dead = false;
    import("leaflet").then((L) => {
      if (dead || !box.current) return;
      const m = L.map(box.current, {
        center: [pin.lat, pin.lng],
        zoom: start ? STREET_ZOOM : 5,
        zoomControl: false,
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      m.attributionControl.setPrefix(false);
      m.on("movestart", () => setMoving(true));
      m.on("moveend", () => {
        const c = m.getCenter();
        setMoving(false);
        setPin({ lat: c.lat, lng: c.lng });
        setZoomedIn(m.getZoom() >= 14);
      });
      map.current = m;
      if (!start) locate();
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is built once
  }, []);

  // look up the area once the map settles
  useEffect(() => {
    if (!zoomedIn) return;
    let live = true;
    const t = window.setTimeout(() => {
      setLooking(true);
      placeAt(pin)
        .then((p) => live && setPlace(p))
        .catch(() => live && setPlace(null))
        .finally(() => live && setLooking(false));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [pin, zoomedIn]);

  // the page behind stays put; Escape closes
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  async function search() {
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    setNote("");
    try {
      const found = await findPlace(q);
      setResults(found);
      if (!found.length) setNote("No places found. Try a nearby landmark or area name.");
    } catch {
      setNote("Search isn't working right now. Drag the map instead.");
    }
    setSearching(false);
  }

  const heading = !zoomedIn
    ? "Zoom in to your street"
    : moving
      ? "Finding the spot…"
      : looking
        ? "Looking up the area…"
        : place?.area || "Unnamed spot";
  const detail =
    zoomedIn && !moving && !looking && place
      ? [place.street, place.city !== place.area ? place.city : "", place.pincode].filter(Boolean).join(", ")
      : "";

  return createPortal(
    <div className="mp" role="dialog" aria-modal="true" aria-label="Pin your delivery location">
      <div ref={box} className="mp-map" />

      <div className={`mp-pin${moving ? " is-lifted" : ""}`} aria-hidden="true">
        <svg width="40" height="52" viewBox="0 0 40 52">
          <path d="M20 51s17-17.6 17-31A17 17 0 0 0 3 20c0 13.4 17 31 17 31z" fill="var(--color-rasta-gold)" stroke="#121212" strokeWidth="2.5" />
          <circle cx="20" cy="20" r="6.5" fill="#121212" />
        </svg>
        <span className="mp-dot" />
      </div>

      <div className="mp-top">
        <button type="button" className="mp-back" onClick={onClose} aria-label="Close the map">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="mp-search">
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Search for an area, street or landmark"
            aria-label="Search for a place"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResults([]);
            }}
            onKeyDown={(e) => {
              // the map sits inside checkout's form: Enter must not submit it
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
          />
          {searching && <span className="mp-spin" aria-label="Searching" />}
          {results.length > 0 && (
            <ul className="mp-results">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setResults([]);
                      setQuery(r.name.split(",")[0]);
                      fly(r);
                    }}
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mp-sheet">
        <button type="button" className="mp-locate" onClick={locate} disabled={locating}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {locating ? "Finding you…" : "Use my current location"}
        </button>
        <p className="mp-kicker">Delivering to</p>
        <p className="mp-area" aria-live="polite">
          {heading}
        </p>
        <p className="mp-detail">{detail || (zoomedIn ? " " : "Drag the map so the pin sits on your door.")}</p>
        {note && (
          <p role="alert" className="mp-note">
            {note}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary mp-confirm"
          disabled={!zoomedIn || moving || looking}
          onClick={() => onConfirm(pin, place)}
        >
          Confirm location
        </button>
      </div>
    </div>,
    document.body,
  );
}
