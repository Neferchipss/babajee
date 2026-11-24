import { test } from "node:test";
import assert from "node:assert/strict";
import { readLook } from "./look-read.ts";

const row = { announcement: "Sale", announcement_link: "", colours: { preset: "haveli" as const, light: {}, dark: {} } };

test("reads the look with its colours", async () => {
  const got = await readLook(async () => ({ data: row, error: null }));
  assert.equal(got.colours?.preset, "haveli");
  assert.equal(got.announcement, "Sale");
});

test("without 0087 (no colours column) the rest is read and colours are Legacy", async () => {
  const seen: string[] = [];
  const got = await readLook(async (cols) => {
    seen.push(cols);
    return cols.includes("colours") ? { data: null, error: { code: "42703", message: "column site_look.colours does not exist" } } : { data: { announcement: "Hi", announcement_link: "" }, error: null };
  });
  assert.equal(seen.length, 2);
  assert.equal(got.colours, null);
  assert.equal(got.announcement, "Hi");
});

test("any other failure throws instead of passing for Legacy", async () => {
  await assert.rejects(readLook(async () => ({ data: null, error: { code: "PGRST301", message: "network" } })));
});

test("no row yet: the defaults", async () => {
  const got = await readLook(async () => ({ data: null, error: null }));
  assert.deepEqual(got, { announcement: "", announcement_link: "", colours: null });
});
