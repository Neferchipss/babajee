import {
  Anton,
  Jost,
  Josefin_Sans,
  Kaushan_Script,
  Playfair_Display,
  Space_Mono,
} from "next/font/google";

// One vocabulary per style:
//   editorial: Playfair Display + Jost, Kaushan Script for the hand-written line
//   refined:   Josefin Sans throughout, set wide and light
//   poster:    Anton for the headlines, Space Mono for the labels
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--f-playfair" });
const jost = Jost({ subsets: ["latin"], variable: "--f-jost" });
const kaushan = Kaushan_Script({ subsets: ["latin"], weight: "400", variable: "--f-kaushan" });
const josefin = Josefin_Sans({ subsets: ["latin"], variable: "--f-josefin" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--f-anton" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--f-mono" });

export const fontVars = [
  playfair.variable,
  jost.variable,
  kaushan.variable,
  josefin.variable,
  anton.variable,
  spaceMono.variable,
].join(" ");
