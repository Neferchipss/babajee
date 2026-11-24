// The shop inside Admin > Storefront > Colours' preview window. Opened with
// ?preview=colours in a frame, it shows the palette being worked on, sent by
// the editor as a message from the shop's own address, in the light or dark
// the preview's own switch picks. Nothing is kept: no palette copy, no
// light/dark choice, no visit counted, no age gate (layout boot script).
import { applyColours } from "./shop-colours-apply.ts";
import type { Mode, ShopColours } from "./shop-colours.ts";

export const PREVIEW_TYPE = "bj-colours-preview";
export type PreviewMessage = { type: typeof PREVIEW_TYPE; colours: ShopColours | null; mode: Mode };

export function isPreviewMessage(e: { origin: string; data: unknown }, ownOrigin: string): e is { origin: string; data: PreviewMessage } {
  if (e.origin !== ownOrigin) return false;
  const d = e.data as Partial<PreviewMessage> | null;
  if (!d || typeof d !== "object" || d.type !== PREVIEW_TYPE) return false;
  if (d.mode !== "light" && d.mode !== "dark") return false;
  return d.colours === null || (typeof d.colours === "object" && d.colours !== undefined);
}

export const inColoursPreview = () => typeof document !== "undefined" && document.documentElement.dataset.preview === "colours";

export function startColoursPreview(): () => void {
  const on = (e: MessageEvent) => {
    if (!isPreviewMessage(e, location.origin)) return;
    applyColours(e.data.colours, { keep: false });
    document.documentElement.dataset.mode = e.data.mode;
  };
  window.addEventListener("message", on);
  return () => window.removeEventListener("message", on);
}

// before the first paint: framed with ?preview=colours, the page marks
// itself as the preview and skips the age gate
export const previewBootScript = `if(new URLSearchParams(location.search).get("preview")==="colours"&&window.self!==window.top){document.documentElement.dataset.preview="colours";document.documentElement.dataset.ageOk="1";}`;
