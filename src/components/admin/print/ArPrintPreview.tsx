"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { SheetDoc } from "@/lib/print-sheet";
import { printSheets, saveCsv } from "./printing";
import { SheetSet } from "./Sheet";
import "./print.css";

// Aronium's print preview: a thin light bar (Print, Save ▾, the page arrows
// and "1 of N"), the pages on a dark desk, and the zoom bar at the bottom
// right (fit width, whole page, actual size, − slider +). It shows either
// Babajee's own sheets (reports, bills, lists) or a page that is already a
// document (the GST invoice, through its embed view). Print prints only the
// document; Save ▾ has Save as PDF (the print window's PDF printer) and, for
// tables, Excel.
// the zoom an element is drawn at (the Aronium design draws at 0.8 on a
// desktop), so sizes taken from the window can be set in its own units
const zoomOf = (el: Element) => {
  let z = 1;
  for (let x: Element | null = el; x; x = x.parentElement) z *= Number(getComputedStyle(x).zoom) || 1;
  return z;
};
// Size an element to the window: "rest" fills from where it starts down to
// the window's bottom (a report under its tab strip), "whole" covers the
// window (the preview layer). Kept up to date as the window resizes.
function useFill(ref: RefObject<HTMLElement | null>, how: "rest" | "whole" | null) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !how) return;
    const fit = () => {
      const z = zoomOf(el);
      if (how === "whole") {
        el.style.width = `${window.innerWidth / z}px`;
        el.style.height = `${window.innerHeight / z}px`;
      } else {
        const top = el.getBoundingClientRect().top;
        el.style.height = `${Math.max(240, (window.innerHeight - top) / z)}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, how]);
}

type Props = {
  docs?: SheetDoc[] | null;
  src?: string;
  // shown on the desk while the document loads, or instead of it
  loading?: boolean;
  error?: string;
  className?: string;
  // fill the window from where the viewer starts down (a report's tab)
  fill?: boolean;
};

export default function ArPrintPreview({ docs, src, loading, error, className = "", fill }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useFill(box, fill ? "rest" : null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(1);
  const [saveOpen, setSaveOpen] = useState(false);
  const [frameReady, setFrameReady] = useState(false);

  // the pages, wherever they are drawn
  const pages = useCallback((): HTMLElement[] => {
    if (src) return Array.from(frame.current?.contentDocument?.querySelectorAll<HTMLElement>(".prt-page") ?? []);
    return Array.from(stage.current?.querySelectorAll<HTMLElement>(".prs-page") ?? []);
  }, [src]);

  // count the pages once they're drawn (a frame keeps loading for a while)
  useEffect(() => {
    let live = true;
    let tries = 0;
    const tick = () => {
      if (!live) return;
      const n = pages().length;
      setCount(Math.max(1, n));
      if (src && !n && tries < 80) {
        tries += 1;
        setTimeout(tick, 150);
      } else if (src && n) setFrameReady(true);
    };
    const t = setTimeout(tick, 60);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [docs, src, pages, frameReady]);

  // zoom: the sheets' own desk, or the invoice page's zoom setting
  useEffect(() => {
    if (!src) return;
    const root = frame.current?.contentDocument?.querySelector<HTMLElement>(".prt");
    root?.style.setProperty("--prt-zoom", String(zoom / 100));
  }, [zoom, src, frameReady]);

  const go = (n: number) => {
    const list = pages();
    const p = Math.min(Math.max(1, n), list.length || 1);
    setPage(p);
    list[p - 1]?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const onScroll = () => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const list = pages();
    const at = list.findIndex((el) => el.getBoundingClientRect().bottom > box.top + 40);
    if (at >= 0) setPage(at + 1);
  };
  const fit = (how: "width" | "page") => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const z = how === "width" ? ((box.width - 48) / 794) * 100 : ((box.height - 32) / 1123) * 100;
    setZoom(Math.max(25, Math.min(200, Math.round(z))));
  };
  const print = () => {
    setSaveOpen(false);
    if (src) {
      frame.current?.contentWindow?.focus();
      frame.current?.contentWindow?.print();
    } else if (docs?.length) printSheets(docs);
  };
  const tabular = !!docs?.length && docs.every((d) => d.cols.length > 0);
  const nothing = !src && !docs?.length;

  return (
    <div className={`prs-view ${className}`} ref={box}>
      <div className="prs-bar">
        <button type="button" onClick={print} disabled={nothing || loading}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6 8V3.5h8V8M5 14H3.5V8h13v6H15M6 11.5h8v5H6z" />
          </svg>
          Print
        </button>
        <span className="prs-save">
          <button type="button" aria-expanded={saveOpen} disabled={nothing || loading} onClick={() => setSaveOpen(!saveOpen)}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 3.5h10l2.5 2.5v10.5h-13zM6.5 3.5v4h6v-4M6.5 16.5v-5h7v5" />
            </svg>
            Save ▾
          </button>
          {saveOpen && (
            <span className="prs-menu" role="menu">
              <button type="button" role="menuitem" onClick={print} title="Pick “Save as PDF” as the printer">
                Save as PDF
              </button>
              {tabular && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSaveOpen(false);
                    docs?.forEach(saveCsv);
                  }}
                >
                  Excel (CSV)
                </button>
              )}
            </span>
          )}
        </span>
        <span className="prs-pages">
          <button type="button" aria-label="First page" disabled={page <= 1} onClick={() => go(1)}>
            |◀
          </button>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
            ◀
          </button>
          <input
            aria-label="Page"
            value={page}
            inputMode="numeric"
            onChange={(e) => {
              const v = Number(e.target.value.replace(/\D/g, ""));
              if (v) go(v);
            }}
          />
          <span>of {count}</span>
          <button type="button" aria-label="Next page" disabled={page >= count} onClick={() => go(page + 1)}>
            ▶
          </button>
          <button type="button" aria-label="Last page" disabled={page >= count} onClick={() => go(count)}>
            ▶|
          </button>
        </span>
      </div>

      <div className="prs-stage" ref={stage} onScroll={onScroll}>
        {error ? (
          <p className="prs-msg is-bad">{error}</p>
        ) : loading ? (
          <p className="prs-msg">Loading…</p>
        ) : src ? (
          <iframe ref={frame} className="prs-frame" src={src} title="Print preview" />
        ) : docs?.length ? (
          <div className="prs-desk" style={{ zoom: zoom / 100 }}>
            <SheetSet docs={docs} />
          </div>
        ) : (
          <p className="prs-msg">Nothing to show.</p>
        )}
      </div>

      <div className="prs-zoom">
        <button type="button" aria-label="Fit the width" title="Fit the width" onClick={() => fit("width")}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2.5 10h15M5 7l-2.5 3L5 13M15 7l2.5 3L15 13M8 3.5v13M12 3.5v13" />
          </svg>
        </button>
        <button type="button" aria-label="Whole page" title="Whole page" onClick={() => fit("page")}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 4.5h14v11H3zM6 7.5h8v5H6z" />
          </svg>
        </button>
        <button type="button" aria-label="Actual size" title="Actual size" onClick={() => setZoom(100)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5.5 2.5h6l3 3v12h-9zM11.5 2.5v3h3" />
          </svg>
        </button>
        <span>{zoom}%</span>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom(Math.max(25, zoom - 10))}>
          −
        </button>
        <input type="range" min={25} max={200} step={5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
        <button type="button" aria-label="Zoom in" onClick={() => setZoom(Math.min(200, zoom + 10))}>
          +
        </button>
      </div>
    </div>
  );
}

// the preview as a full-screen layer over a screen (an order, a bill), with a
// close cross, for screens that don't have a tab strip to open it in
export function PreviewLayer({ title, onClose, ...p }: Props & { title: string; onClose: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  useFill(layer, "whole");
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="prs-layer" ref={layer} role="dialog" aria-label={`Print preview: ${title}`}>
      <div className="prs-layer-head">
        <span>
          Print preview <b>{title}</b>
        </span>
        <button type="button" aria-label="Close the preview" onClick={onClose}>
          ×
        </button>
      </div>
      <ArPrintPreview {...p} />
    </div>
  );
}
