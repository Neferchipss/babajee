"use client";

import { useEffect, useState } from "react";
import { liveSearchCatalog, type DbSearchProduct } from "./catalog-db";

// Static exports supply the initial shelf. A successful public read (including
// an empty catalogue) replaces it on arrival and when returning from admin.
export function useLiveCatalog() {
  const [catalog, setCatalog] = useState<DbSearchProduct[] | null>(null);
  useEffect(() => {
    let current = true;
    let latest = 0;
    async function refresh() {
      const request = ++latest;
      const rows = await liveSearchCatalog();
      if (current && request === latest && rows !== null) setCatalog(rows);
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      current = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return catalog;
}
