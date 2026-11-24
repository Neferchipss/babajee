import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, filled, isLegacy, LEGACY, mix, paletteCss, PRESETS, SLOTS, themeBar, type ShopColours } from "./shop-colours.ts";

test("contrast: black on white is 21", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
});

test("mix: halfway, and a colour with itself", () => {
  assert.equal(mix("#000000", "#ffffff", 50), "#808080");
  assert.equal(mix("#123456", "#123456", 30), "#123456");
});

test("legacy emits nothing", () => {
  assert.equal(paletteCss(null), "");
  assert.equal(paletteCss({ preset: "legacy", light: {}, dark: {} }), "");
  assert.equal(paletteCss({ preset: "custom", light: { ...LEGACY.light }, dark: { ...LEGACY.dark } }), "");
  assert.equal(isLegacy(null), true);
});

test("partial palette falls back to Legacy per slot", () => {
  const p = filled({ preset: "custom", light: { accent: "#c3141a" }, dark: {} }, "light");
  assert.equal(p.accent, "#c3141a");
  assert.equal(p.page, "#ffffff");
  assert.equal(filled({ preset: "custom", light: { page: "red" as never }, dark: {} }, "light").page, "#ffffff");
  assert.equal(filled({ preset: "custom", light: { page: "#FFFFFF" as never }, dark: {} }, "light").page, "#ffffff");
});

test("css sets the mapped properties, outside the admin", () => {
  const css = paletteCss({ preset: "custom", light: { accent: "#c3141a" }, dark: {} });
  assert.match(css, /--bb-maroon: #c3141a/);
  assert.match(css, /--plate-ink: #c3141a/);
  assert.match(css, /--bbn-glow: 195 20 26/);
  assert.match(css, /:not\(:has\(\.adm-frame\)\)/);
  assert.match(css, /#site\[data-scope="shop"\]/);
});

test("color-ink follows text on accent", () => {
  const css = paletteCss({ preset: "custom", light: { onAccent: "#fffaf0" }, dark: {} });
  assert.match(css, /--color-ink: #fffaf0/);
});

test("only a changed mode gets a block", () => {
  const css = paletteCss({ preset: "custom", light: { accent: "#c3141a" }, dark: {} });
  assert.match(css, /data-mode="light"/);
  assert.doesNotMatch(css, /data-mode="dark"/);
});

test("themeBar: the header bar colour per mode", () => {
  assert.equal(themeBar(null, "dark"), "#000000");
  assert.equal(themeBar(null, "light"), "#ffffff");
  assert.equal(themeBar({ preset: "custom", light: { bar: "#2b1a12" }, dark: {} } as ShopColours, "light"), "#2b1a12");
});

test("presets are complete, Legacy first", () => {
  assert.equal(PRESETS[0].id, "legacy");
  assert.deepEqual(PRESETS.map((p) => p.id), ["legacy", "haveli", "chai", "courtyard"]);
  for (const p of PRESETS)
    for (const m of ["light", "dark"] as const)
      for (const s of SLOTS) assert.match(p[m][s.id], /^#[0-9a-f]{6}$/, `${p.id} ${m} ${s.id}`);
  assert.equal(SLOTS.length, 11);
});
