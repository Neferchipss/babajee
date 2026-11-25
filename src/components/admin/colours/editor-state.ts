// The Colours editor's working palette (ColourEditor.tsx), kept pure so it
// can be tested: always both modes in full, so every part has a colour to
// show; named after the preset it matches exactly, else Custom.
import { CONTRAST_PAIRS, contrast, filled, PRESETS, type Mode, type PresetId, type ShopColours, type Slot } from "../../../lib/shop-colours.ts";

export type Working = ShopColours & { light: Required<ShopColours["light"]>; dark: Required<ShopColours["dark"]> };

export function pickPreset(id: Exclude<PresetId, "custom">): Working {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { preset: p.id, light: { ...p.light }, dark: { ...p.dark } };
}

const matching = (c: Working): PresetId => PRESETS.find((p) => (["light", "dark"] as const).every((m) => Object.entries(p[m]).every(([k, v]) => c[m][k as Slot] === v)))?.id ?? "custom";

export function setSlot(c: Working, mode: Mode, slot: Slot, hex: string): Working {
  const next: Working = { ...c, [mode]: { ...c[mode], [slot]: hex } };
  return { ...next, preset: matching(next) };
}

export function warnings(c: Working, mode: Mode): { label: string; ratio: number; min: number }[] {
  return CONTRAST_PAIRS.map((p) => ({ label: p.label, ratio: contrast(c[mode][p.a], c[mode][p.b]), min: p.min })).filter((w) => w.ratio < w.min);
}

// "#abc" or "#aabbcc", any case, spaces around ignored; null if not a colour
export function normaliseHex(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{3}$/.test(t)) return "#" + [...t.slice(1)].map((ch) => ch + ch).join("");
  return null;
}

// the saved palette, filled in full (a part never set is Legacy's)
export function fromSaved(c: ShopColours | null): Working {
  return { preset: c?.preset ?? "legacy", light: filled(c, "light"), dark: filled(c, "dark") };
}

// Revert: what is live, read again from the database
export async function revert(getLook: () => Promise<{ colours: ShopColours | null }>): Promise<Working> {
  return fromSaved((await getLook()).colours);
}
