import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../../../lib/shop-colours.ts";
import { normaliseHex, pickPreset, revert, setSlot, warnings } from "./editor-state.ts";

const haveli = PRESETS.find((p) => p.id === "haveli")!;

test("picking a preset loads all of it, both modes", () => {
  const c = pickPreset("haveli");
  assert.equal(c.preset, "haveli");
  assert.deepEqual(c.light, haveli.light);
  assert.deepEqual(c.dark, haveli.dark);
});

test("changing a part makes it Custom; changing it back is the preset again", () => {
  const changed = setSlot(pickPreset("haveli"), "light", "accent", "#123456");
  assert.equal(changed.preset, "custom");
  assert.equal(changed.light.accent, "#123456");
  const back = setSlot(changed, "light", "accent", haveli.light.accent);
  assert.equal(back.preset, "haveli");
});

test("warnings: hard-to-read text is flagged with its ratio", () => {
  const c = setSlot(setSlot(pickPreset("legacy"), "light", "text", "#777777"), "light", "page", "#888888");
  const w = warnings(c, "light");
  const page = w.find((x) => x.label === "Text on page background");
  assert.ok(page);
  assert.ok(page.ratio < 4.5);
  assert.equal(warnings(pickPreset("legacy"), "light").length, 0);
});

test("normaliseHex: #rgb and #rrggbb in any case, needs the #", () => {
  assert.equal(normaliseHex("#ABC"), "#aabbcc");
  assert.equal(normaliseHex("#c3141a"), "#c3141a");
  assert.equal(normaliseHex(" #C3141A "), "#c3141a");
  assert.equal(normaliseHex("c3141a"), null);
  assert.equal(normaliseHex("#zzz"), null);
});

test("revert loads from the database, not from memory", async () => {
  let calls = 0;
  const saved = { preset: "chai" as const, light: {}, dark: {} };
  const got = await revert(async () => {
    calls++;
    return { announcement: "", announcement_link: "", colours: saved };
  });
  assert.equal(calls, 1);
  assert.equal(got.preset, "chai");
  assert.deepEqual(got.light, PRESETS.find((p) => p.id === "legacy")!.light);
});
