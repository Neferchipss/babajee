import { Archivo, Cormorant_Garamond, Rubik_Wet_Paint } from "next/font/google";

// preload is off so a visitor only downloads the fonts of the theme they see.
// (next/font needs its options written out literally, so there's no shared
// options object.)
// Night: the italic serif for the quiet lines.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  style: "italic",
  variable: "--f-cormorant",
  preload: false,
  display: "swap",
});

// Baba: dripping ink for titles, a sturdy grotesk for the uppercase labels.
const wetPaint = Rubik_Wet_Paint({ subsets: ["latin"], weight: "400", variable: "--f-wetpaint", preload: false, display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--f-archivo", preload: false, display: "swap" });

export const themeFontVars = [cormorant, wetPaint, archivo].map((f) => f.variable).join(" ");
