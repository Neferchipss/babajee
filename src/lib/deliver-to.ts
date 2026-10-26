"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_ADDRESS, shortLine, type Address, type AddressInput, type Pin } from "./addresses";

// Where the shop is delivering to, as picked in the header: a saved address,
// or just a spot (the phone's location, or a pin dropped by a guest). Kept in
// this browser so checkout can start from it. Same key the header always
// used, so a location found before this existed still shows.
export type DeliverTo = {
  area: string; // the bold part in the header, e.g. "Home" or "Khar"
  line: string; // the grey part, e.g. "Hill Road, Mumbai 400050"
  addressId?: string; // set when it is a saved address
  pin?: Pin;
  city?: string;
  state?: string;
  pincode?: string;
};

const KEY = "bb-address";
const EVENT = "bb-deliver-change";

let cached: { raw: string | null; value: DeliverTo | null } = { raw: null, value: null };

function read(): DeliverTo | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cached.raw) {
    let value: DeliverTo | null = null;
    try {
      value = raw ? (JSON.parse(raw) as DeliverTo) : null;
    } catch {}
    cached = { raw, value };
  }
  return cached.value;
}

export const getDeliverTo = read;

export function setDeliverTo(next: DeliverTo | null) {
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDeliverTo() {
  return useSyncExternalStore(subscribe, read, () => null);
}

// A saved address as the header shows it: "Home", "Hill Road, Khar, Mumbai 400050".
export function deliverToAddress(a: Address): DeliverTo {
  return {
    area: a.label,
    line: shortLine(a),
    addressId: a.id,
    pin: a.latitude !== null && a.longitude !== null ? { lat: a.latitude, lng: a.longitude } : undefined,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
  };
}

// A new address starts from a spot picked in the header (not a saved one):
// already pinned, with city, state and PIN filled in.
export function startFrom(where: DeliverTo | null, base: AddressInput = EMPTY_ADDRESS): AddressInput {
  if (!where || where.addressId || !where.pin) return base;
  return {
    ...base,
    latitude: where.pin.lat,
    longitude: where.pin.lng,
    city: where.city ?? base.city,
    state: where.state ?? base.state,
    pincode: where.pincode ?? base.pincode,
  };
}
