// The shop's colours (Admin > Storefront > Colours, 0087): eleven parts of the
// shop, each with a light and a dark colour, saved shop-wide as
// site_look.colours. This file is the pure part: the parts, the presets, the
// shades worked out from a pick, the readability check, and the CSS a palette
// becomes. Legacy is today's colours (src/app/themes/modes.css) and makes no
// CSS at all, so the stylesheets' own values apply. Applying it in the
// browser is shop-colours-apply.ts.

export type Slot = "page" | "panels" | "lines" | "text" | "secondary" | "backdrop" | "accent" | "onAccent" | "hot" | "green" | "bar";
export type Mode = "light" | "dark";
export type Palette = Record<Slot, string>;
export type PresetId = "legacy" | "haveli" | "chai" | "courtyard" | "custom";
export type ShopColours = { preset: PresetId; light: Partial<Palette>; dark: Partial<Palette> };

export const SLOTS: { id: Slot; label: string; hint: string }[] = [
  { id: "page", label: "Page background", hint: "Behind everything on the page" },
  { id: "panels", label: "Panels and cards", hint: "Cards, sheets, menus and fields" },
  { id: "lines", label: "Lines", hint: "Borders and dividers" },
  { id: "text", label: "Text", hint: "Headings and body text" },
  { id: "secondary", label: "Secondary text", hint: "Notes, labels and quieter text" },
  { id: "backdrop", label: "Product photo backdrop", hint: "Behind product photos" },
  { id: "accent", label: "Accent (buttons, links, highlights)", hint: "Main buttons, links, focus rings" },
  { id: "onAccent", label: "Text on accent", hint: "Words on the accent colour" },
  { id: "hot", label: "Cart and highlights", hint: "View cart bar, add buttons, chosen filters, hearts, stars and badges" },
  { id: "green", label: "Green (in stock, success)", hint: "In stock, done, saved" },
  { id: "bar", label: "Header bar", hint: "The bar along the top, and the phone's browser bar" },
];

const HEX = /^#[0-9a-f]{6}$/;

export const LEGACY: { light: Palette; dark: Palette } = {
  light: { page: "#ffffff", panels: "#ffffff", lines: "#e7eaee", text: "#0c0f14", secondary: "#686f78", backdrop: "#f0f2f5", accent: "#d3ab70", onAccent: "#0c0f14", hot: "#d3ab70", green: "#0f8a5f", bar: "#ffffff" },
  dark: { page: "#000000", panels: "#121213", lines: "#272729", text: "#f2f3f5", secondary: "#96979d", backdrop: "#121213", accent: "#d3ab70", onAccent: "#000000", hot: "#d3ab70", green: "#23a55a", bar: "#000000" },
};

// Haveli, Chai corner and Courtyard: the old storefront designs' shop colours
// (shop-designs.css), as palettes
export const PRESETS: { id: Exclude<PresetId, "custom">; name: string; light: Palette; dark: Palette }[] = [
  { id: "legacy", name: "Legacy", ...LEGACY },
  {
    id: "haveli",
    name: "Haveli",
    light: { page: "#fbf4e6", panels: "#fffaf0", lines: "#e8d6b5", text: "#2b1a12", secondary: "#6f5444", backdrop: "#f3ebdc", accent: "#c3141a", onAccent: "#fffaf0", hot: "#c3141a", green: "#167a43", bar: "#fbf4e6" },
    dark: { page: "#1e0f10", panels: "#2a1416", lines: "#55282b", text: "#fbf1e1", secondary: "#c9ad92", backdrop: "#efe6d6", accent: "#ff6a5f", onAccent: "#1e0f10", hot: "#ff4b40", green: "#5fd08e", bar: "#1e0f10" },
  },
  {
    id: "chai",
    name: "Chai corner",
    light: { page: "#fff7e2", panels: "#fffdf5", lines: "#f0dca6", text: "#33200f", secondary: "#74593c", backdrop: "#f7eed6", accent: "#8a5a00", onAccent: "#fffdf5", hot: "#b3261e", green: "#2f7d32", bar: "#fff7e2" },
    dark: { page: "#1d140a", panels: "#271b0e", lines: "#4d3a1d", text: "#fff3d6", secondary: "#d0b48a", backdrop: "#f1e8d4", accent: "#f2b230", onAccent: "#1d140a", hot: "#ff7a59", green: "#7fd39a", bar: "#1d140a" },
  },
  {
    id: "courtyard",
    name: "Courtyard",
    light: { page: "#f2f8ee", panels: "#ffffff", lines: "#d5e6cb", text: "#13261a", secondary: "#4f6455", backdrop: "#eef3ea", accent: "#0f7a3d", onAccent: "#ffffff", hot: "#d4231f", green: "#0f7a3d", bar: "#f2f8ee" },
    dark: { page: "#0d1a12", panels: "#12241a", lines: "#26452f", text: "#eef8ea", secondary: "#a7c4ae", backdrop: "#e6efe3", accent: "#4fd38a", onAccent: "#0d1a12", hot: "#ff6a5c", green: "#4fd38a", bar: "#0d1a12" },
  },
];

export const CONTRAST_PAIRS: { a: Slot; b: Slot; min: number; label: string }[] = [
  { a: "text", b: "page", min: 4.5, label: "Text on page background" },
  { a: "text", b: "panels", min: 4.5, label: "Text on panels" },
  { a: "secondary", b: "page", min: 4.5, label: "Secondary text on page background" },
  { a: "onAccent", b: "accent", min: 3, label: "Text on accent" },
];

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hexOf = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const triplet = (hex: string) => rgb(hex).join(" ");

// pct of b mixed into a, like color-mix(in srgb, a, b pct%)
export function mix(a: string, b: string, pct: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hexOf(x.map((v, i) => v + (y[i] - v) * (pct / 100)));
}

const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG contrast ratio, to two places
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// a mode's full palette: anything missing or malformed is Legacy's
export function filled(c: ShopColours | null, mode: Mode): Palette {
  const out = { ...LEGACY[mode] };
  const given = c?.[mode];
  if (given && typeof given === "object")
    for (const s of SLOTS) {
      const v = typeof given[s.id] === "string" ? given[s.id]!.toLowerCase() : "";
      if (HEX.test(v)) out[s.id] = v;
    }
  return out;
}

const sameAsLegacy = (p: Palette, mode: Mode) => SLOTS.every((s) => p[s.id] === LEGACY[mode][s.id]);

export function isLegacy(c: ShopColours | null): boolean {
  return !c || (sameAsLegacy(filled(c, "light"), "light") && sameAsLegacy(filled(c, "dark"), "dark"));
}

export function themeBar(c: ShopColours | null, mode: Mode): string {
  return filled(c, mode).bar;
}

function modeBlock(p: Palette, mode: Mode): string {
  const vars: [string, string][] = [
    ["--color-char", p.page],
    ["--bb-bg", triplet(p.page)],
    ["--bbn-scrim", triplet(p.page)],
    ["--color-iron", p.panels],
    ["--bb-sheet", p.panels],
    ["--bbn-deep", p.panels],
    ["--color-ash", mix(p.panels, p.text, 6)],
    ["--bb-blush", mix(p.panels, p.text, 6)],
    ["--color-line", p.lines],
    ["--bbn-edge", p.lines],
    ["--color-paper", p.text],
    ["--bb-ink", p.text],
    ["--bb-fg", triplet(p.text)],
    ["--color-muted", p.secondary],
    ["--color-plate", p.backdrop],
    ["--bb-maroon", p.accent],
    ["--bb-rose", p.accent],
    ["--color-rasta-gold", p.accent],
    ["--plate-ink", p.accent],
    ["--bbn-glow", triplet(p.accent)],
    ["--bb-maroon-dk", mix(p.accent, p.text, 15)],
    ["--bb-on-accent", p.onAccent],
    ["--color-ink", p.onAccent],
    ["--bb-hot", p.hot],
    ["--bb-green", p.green],
    ["--bb-green-dk", mix(p.green, "#000000", 25)],
    ["--bb-bar", triplet(p.bar)],
    ["--bb-scrim", mode === "light" ? `rgb(${triplet(p.text)} / 0.36)` : `rgb(${triplet(p.page)} / 0.7)`],
  ];
  const body = vars.map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `:root[data-mode="${mode}"]:not(:has(.adm-frame)),\nhtml[data-theme="baba-poster"][data-mode="${mode}"] #site[data-scope="shop"]:not(:has(.adm-frame)) {\n${body}\n}`;
}

// the CSS for a saved palette: a block for each mode that differs from
// Legacy, nothing at all for Legacy
export function paletteCss(c: ShopColours | null): string {
  if (!c) return "";
  const blocks: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    const p = filled(c, mode);
    if (!sameAsLegacy(p, mode)) blocks.push(modeBlock(p, mode));
  }
  return blocks.join("\n");
}
