import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.ts";

test("names become address parts", () => {
  assert.equal(slugify("RAW Classic King Size"), "raw-classic-king-size");
  assert.equal(slugify("  Grinder (Black / Gold)  "), "grinder-black-gold");
  assert.equal(slugify("3-in-1 Aluminium Grinder"), "3-in-1-aluminium-grinder");
});

test("accents become plain letters", () => {
  assert.equal(slugify("Café Crème Papers"), "cafe-creme-papers");
});

test("long names are cut without leaving a dash at the end", () => {
  assert.equal(slugify("aaaa bbbb cccc", { max: 10 }), "aaaa-bbbb");
  assert.equal(slugify("a".repeat(100), { max: 60 }).length, 60);
});

test("a name of only symbols falls back", () => {
  assert.equal(slugify("!!!", { fallback: "page" }), "page");
  assert.equal(slugify("✨"), "");
});
