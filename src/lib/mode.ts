"use client";

import { useSyncExternalStore } from "react";
import { MODE_KEY } from "./mode-boot";

// Light or dark. "system" (the default) follows the phone or computer, and
// keeps following it if it changes (sunset, say). The choice is kept in this
// browser; <html data-mode> carries what is showing, set before the first
// paint by the layout's boot script, so a page never flashes the wrong one.
export type ModePref = "system" | "light" | "dark";
const EVENT = "bj-mode-change";
// the browser's own bars, matched to the page
const BAR = { dark: "#0c0a1c", light: "#f6f3fc" };

const prefersLight = () => window.matchMedia("(prefers-color-scheme: light)").matches;

function readPref(): ModePref {
  try {
    const p = localStorage.getItem(MODE_KEY);
    if (p === "light" || p === "dark") return p;
  } catch {}
  return "system";
}

export function applyMode() {
  const pref = readPref();
  const mode = pref === "system" ? (prefersLight() ? "light" : "dark") : pref;
  const root = document.documentElement;
  root.dataset.mode = mode;
  root.dataset.modePref = pref;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[mode]);
}

export function setModePref(pref: ModePref) {
  try {
    if (pref === "system") localStorage.removeItem(MODE_KEY);
    else localStorage.setItem(MODE_KEY, pref);
  } catch {}
  applyMode();
  window.dispatchEvent(new Event(EVENT));
}

// the system's choice changing, while it is the one followed
export function watchSystemMode() {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const on = () => {
    if (readPref() === "system") applyMode();
  };
  applyMode();
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
export const useModePref = () => useSyncExternalStore(subscribe, readPref, () => "system" as ModePref);
