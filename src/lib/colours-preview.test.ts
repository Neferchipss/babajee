import { test } from "node:test";
import assert from "node:assert/strict";
import { isPreviewMessage } from "./colours-preview.ts";

const msg = { type: "bj-colours-preview", colours: null, mode: "dark" };

test("accepts a preview message from the shop's own origin", () => {
  assert.equal(isPreviewMessage({ origin: "https://a.test", data: msg }, "https://a.test"), true);
  assert.equal(isPreviewMessage({ origin: "https://a.test", data: { ...msg, colours: { preset: "custom", light: { accent: "#c3141a" }, dark: {} } } }, "https://a.test"), true);
});

test("rejects a message from another origin", () => {
  assert.equal(isPreviewMessage({ origin: "https://evil.test", data: msg }, "https://a.test"), false);
});

test("rejects the wrong shape", () => {
  assert.equal(isPreviewMessage({ origin: "https://a.test", data: { type: "x" } }, "https://a.test"), false);
  assert.equal(isPreviewMessage({ origin: "https://a.test", data: { ...msg, mode: "sepia" } }, "https://a.test"), false);
  assert.equal(isPreviewMessage({ origin: "https://a.test", data: { ...msg, colours: "red" } }, "https://a.test"), false);
  assert.equal(isPreviewMessage({ origin: "https://a.test", data: null }, "https://a.test"), false);
});
