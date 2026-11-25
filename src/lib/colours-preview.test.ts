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

test("the frame's ready signal is recognised only from the shop's own origin", async () => {
  const { isReadyMessage, READY_TYPE } = await import("./colours-preview.ts");
  assert.equal(isReadyMessage({ origin: "https://a.test", data: { type: READY_TYPE } }, "https://a.test"), true);
  assert.equal(isReadyMessage({ origin: "https://evil.test", data: { type: READY_TYPE } }, "https://a.test"), false);
  assert.equal(isReadyMessage({ origin: "https://a.test", data: { type: "bj-colours-preview" } }, "https://a.test"), false);
});

function runBoot(parentOrigin: string | "blocked") {
  return import("./colours-preview.ts").then(({ previewBootScript }) => {
    const dataset: Record<string, string> = {};
    const top = {};
    const parent = { get location() { if (parentOrigin === "blocked") throw new Error("cross-origin"); return { origin: parentOrigin }; } };
    const window = { self: {}, top, parent };
    const location = { search: "?preview=colours", origin: "https://a.test" };
    new Function("window", "location", "document", previewBootScript)(window, location, { documentElement: { dataset } });
    return dataset;
  });
}

test("the preview boot only trusts a frame from the shop's own origin", async () => {
  assert.equal((await runBoot("https://a.test")).preview, "colours");
  const foreign = await runBoot("blocked");
  assert.equal(foreign.preview, undefined);
  assert.equal(foreign.ageOk, undefined);
});
