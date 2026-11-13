"use client";

import { useEffect, useState } from "react";
import { liveSearchCatalog, type DbSearchProduct } from "./catalog-db";

// Static exports supply the initial shelf. A successful public read (including
// an empty catalogue) replaces it on arrival and when returning from admin.
//
// One read serves every component that asks within a short while (the shelf,
// the cart's suggestions, the stock checks), so a page fetches the catalogue
// once, not once per component.
const FRESH_MS = 30_000;
let last: { at: number; rows: Promise<DbSearchProduct[] | null> } | null = null;
function shared(force = false) {
  const now = Date.now();
  if (force || !last || now - last.at > FRESH_MS) {
    const rows = liveSearchCatalog().catch(() => null);
    last = { at: now, rows };
    // a failed read isn't kept: the next ask tries again
    void rows.then((r) => {
      if (r === null && last?.rows === rows) last = null;
    });
  }
  return last!.rows;
}

export function useLiveCatalog() {
  const [catalog, setCatalog] = useState<DbSearchProduct[] | null>(null);
  useEffect(() => {
    let current = true;
    let latest = 0;
    async function refresh(force = false) {
      const request = ++latest;
      const rows = await shared(force);
      if (current && request === latest && rows !== null) setCatalog(rows);
    }
    void refresh();
    // back on the tab (e.g. from the admin): a fresh read, if the last is old
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      current = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return catalog;
}
