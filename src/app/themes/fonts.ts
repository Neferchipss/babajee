import {
  Bagel_Fat_One,
  Caprasimo,
  DM_Sans,
  Figtree,
  Josefin_Sans,
  Karla,
  Londrina_Solid,
  Nunito_Sans,
  Permanent_Marker,
  Sedgwick_Ave_Display,
} from "next/font/google";

// One display face and one text face per theme. preload is off so a visitor
// only downloads the fonts of the theme they actually pick. (next/font needs
// its options written out literally, so there's no shared options object.)
const bagel = Bagel_Fat_One({ subsets: ["latin"], weight: "400", variable: "--f-bagel", preload: false, display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--f-figtree", preload: false, display: "swap" });
const londrina = Londrina_Solid({ subsets: ["latin"], weight: ["400", "900"], variable: "--f-londrina", preload: false, display: "swap" });
const karla = Karla({ subsets: ["latin"], variable: "--f-karla", preload: false, display: "swap" });
const sedgwick = Sedgwick_Ave_Display({ subsets: ["latin"], weight: "400", variable: "--f-sedgwick", preload: false, display: "swap" });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--f-marker", preload: false, display: "swap" });
const nunito = Nunito_Sans({ subsets: ["latin"], variable: "--f-nunito", preload: false, display: "swap" });
const josefin = Josefin_Sans({ subsets: ["latin"], variable: "--f-josefin", preload: false, display: "swap" });
const caprasimo = Caprasimo({ subsets: ["latin"], weight: "400", variable: "--f-caprasimo", preload: false, display: "swap" });
const dmsans = DM_Sans({ subsets: ["latin"], variable: "--f-dmsans", preload: false, display: "swap" });

export const themeFontVars = [
  bagel,
  figtree,
  londrina,
  karla,
  sedgwick,
  marker,
  nunito,
  josefin,
  caprasimo,
  dmsans,
]
  .map((f) => f.variable)
  .join(" ");
