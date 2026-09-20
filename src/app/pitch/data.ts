import type { StaticImageData } from "next/image";
import { A_IMAGES, B_IMAGES, C_IMAGES } from "@/assets/pitch";
import { CATEGORIES } from "@/lib/catalog-data";

// Sample content for the design pitch. Each style keeps the product names and
// photos from its own reference; none of these are real stock.

export type Dot = "red" | "gold" | "green" | "off";
export type Product = {
  name: string;
  note: string;
  image: StaticImageData;
  badge?: string;
  dots?: [Dot, Dot, Dot];
};

const at = (list: StaticImageData[], i: number) => list[i];

export const EDITORIAL_PRODUCTS: Product[] = [
  { name: "Rasta Beaker", note: "Smooth sessions", image: at(A_IMAGES, 0), dots: ["red", "gold", "green"] },
  { name: "Jah Spoon Pipe", note: "Compact. Timeless.", image: at(A_IMAGES, 1), dots: ["red", "gold", "off"] },
  { name: "Heritage Grinder", note: "Built to last", image: at(A_IMAGES, 2), dots: ["off", "gold", "off"] },
  { name: "Rooted Tray", note: "Good sessions ahead", image: at(A_IMAGES, 3), dots: ["off", "gold", "off"] },
  { name: "Rasta Lighter", note: "Small flame. Big energy.", image: at(A_IMAGES, 4), dots: ["red", "gold", "off"] },
  { name: "Ash Catcher", note: "Cleaner hits", image: at(A_IMAGES, 5), dots: ["red", "gold", "off"] },
  { name: "Hemp Papers", note: "Natural flow", image: at(A_IMAGES, 6), dots: ["off", "gold", "off"] },
  { name: "Storage Jar", note: "Keep it fresh", image: at(A_IMAGES, 7), dots: ["off", "gold", "off"] },
];

export const REFINED_PRODUCTS: Product[] = [
  { name: "Irie Glass Pipe", note: "", image: at(B_IMAGES, 0), badge: "Best seller" },
  { name: "Baba Beaker", note: "", image: at(B_IMAGES, 1) },
  { name: "Rasta Grinder", note: "", image: at(B_IMAGES, 2) },
  { name: "Good Vibes Tray", note: "", image: at(B_IMAGES, 3) },
  { name: "Babajee Papers", note: "", image: at(B_IMAGES, 4) },
  { name: "Peace Ashtray", note: "", image: at(B_IMAGES, 5) },
  { name: "Clean Kit", note: "", image: at(B_IMAGES, 6) },
  { name: "Stash Jar", note: "", image: at(B_IMAGES, 7) },
];

export const POSTER_PRODUCTS: Product[] = [
  { name: "Classic Beaker", note: "14\" glass pipe", image: at(C_IMAGES, 0), badge: "Best seller" },
  { name: "Rasta Spoon", note: "Premium glass", image: at(C_IMAGES, 1) },
  { name: "The Daily Grind", note: "4-piece grinder", image: at(C_IMAGES, 2) },
  { name: "Good Company Tray", note: "Metal rolling tray", image: at(C_IMAGES, 3) },
  { name: "Stash Jar", note: "Airtight glass", image: at(C_IMAGES, 4) },
  { name: "Raw Classic", note: "Rolling papers", image: at(C_IMAGES, 5) },
  { name: "Babajee Lighter", note: "Refillable", image: at(C_IMAGES, 6) },
  { name: "Cleaning Kit", note: "Keep it fresh", image: at(C_IMAGES, 7) },
];

// The real catalogue's biggest categories, so the sidebar tells the truth.
export const SIDE_CATEGORIES = CATEGORIES.slice(0, 8).map((c) => ({
  name: c.name,
  count: c.products.length,
}));

export const PRICE_RANGES = ["Under Rs.500", "Rs.500 - 1,000", "Rs.1,000 - 2,500", "Rs.2,500+"];
export const PRICE = "Rs.xx.xx";
