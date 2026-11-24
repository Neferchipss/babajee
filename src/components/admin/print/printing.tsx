"use client";

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { download } from "@/lib/orders-csv";
import { sheetCsv, type SheetDoc } from "@/lib/print-sheet";
import { gridIn, gridSheet } from "./docs";
import { SheetSet } from "./Sheet";

// Printing without printing the admin. printSheets draws the documents into
// a layer of their own at the end of the page, marks the page as printing
// (print.css then hides everything else and sets A4 margins), opens the
// browser's print window, and takes the layer away again. "Save as PDF" is
// the same window: the browser's own PDF printer. printFrame does the same
// for a page that is already a document (the GST invoice): it loads it out of
// sight and prints that page alone.

let busy = false;

export function printSheets(docs: SheetDoc[]) {
  if (busy || !docs.length || typeof document === "undefined") return;
  busy = true;
  const host = document.createElement("div");
  host.className = "prs-print";
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<SheetSet docs={docs} />));
  const title = document.title;
  if (docs[0]?.file) document.title = docs[0].file;
  document.documentElement.classList.add("prs-printing");
  const paper = document.createElement("style");
  paper.textContent = "@page { size: A4; margin: 0; } @page land { size: A4 landscape; margin: 0; }";
  document.head.appendChild(paper);
  const done = () => {
    window.removeEventListener("afterprint", done);
    paper.remove();
    document.documentElement.classList.remove("prs-printing");
    document.title = title;
    root.unmount();
    host.remove();
    busy = false;
  };
  window.addEventListener("afterprint", done);
  // a frame for the layer to lay out before the print window takes a picture
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.print();
      // browsers that don't send afterprint: print() has returned by now
      setTimeout(() => busy && done(), 500);
    }),
  );
}

export function saveCsv(doc: SheetDoc) {
  download(`${doc.file ?? doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, sheetCsv(doc));
}

// Print a document page (the invoice) without opening it: load it in a frame
// out of sight, wait until its sheets are drawn, print that frame.
export function printFrame(src: string, ready = ".prt-page", onError?: (msg: string) => void) {
  if (typeof document === "undefined") return;
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:900px;height:600px;border:0;opacity:0;pointer-events:none;";
  f.src = src;
  document.body.appendChild(f);
  let tries = 0;
  const wait = () => {
    const d = f.contentDocument;
    const ok = d?.querySelector(ready);
    // a note instead of sheets (not paid yet, no refunds): say it, don't wait
    const said = Array.from(d?.querySelectorAll(".prt-note") ?? [])
      .map((n) => n.textContent ?? "")
      .filter((t) => t && !/Getting the/.test(t));
    const bad = !ok && said.length && tries > 6 ? said.join(" ") : d?.querySelector(".prt-note.is-bad")?.textContent;
    if (ok) {
      // a moment for images (the logo) to come in
      setTimeout(() => {
        f.contentWindow?.focus();
        f.contentWindow?.print();
        setTimeout(() => f.remove(), 1000);
      }, 300);
      return;
    }
    tries += 1;
    if (bad || tries > 100) {
      onError?.(bad || "The document didn't load. Try Print preview.");
      f.remove();
      return;
    }
    setTimeout(wait, 150);
  };
  f.addEventListener("load", () => setTimeout(wait, 150));
}

// the GST invoice (or credit notes) page for some orders, as a document only:
// embed=1 drops its own bar, for the preview and for printFrame
export const invoiceSrc = (ids: string[], doc: "invoice" | "cn" = "invoice") => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/admin/orders/print?ids=${ids.join(",")}&doc=${doc}&embed=1`;

// Print the list on screen as an A4 sheet: the first grid on the page (or in
// scope), its columns and rows as shown, the screen's filters as details.
export function printGrid(title: string, meta: [string, string][] = [], scope?: Element | null) {
  const doc = gridSheet(gridIn(scope ?? document.querySelector(".ar-page")), title, meta);
  printSheets([doc]);
}
