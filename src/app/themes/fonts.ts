import { Archivo, Cormorant_Garamond, Josefin_Sans, Rubik_Wet_Paint } from "next/font/google";

// Refined: wide-tracked geometric caps, with an italic serif for the quiet lines.
// preload is off so a visitor only downloads the fonts of the theme they see.
// (next/font needs its options written out literally, so there's no shared
// options object.)
const josefin = Josefin_Sans({ subsets: ["latin"], variable: "--f-josefin", preload: false, display: "swap" });
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

export const themeFontVars = [josefin, cormorant, wetPaint, archivo].map((f) => f.variable).join(" ");
