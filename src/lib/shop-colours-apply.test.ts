import { test } from "node:test";
import assert from "node:assert/strict";
import { applyColours, cachedBar, COLOURS_KEY, type ApplyEnv } from "./shop-colours-apply.ts";

function fakeEnv(mode: "light" | "dark" = "light") {
  const store = new Map<string, string>();
  const state = { css: null as string | null, bar: "" };
  const env: ApplyEnv = {
    setStyle: (css) => {
      state.css = css;
    },
    store: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    mode: () => mode,
    setBar: (hex) => {
      state.bar = hex;
    },
  };
  return { env, store, state };
}

const custom = { preset: "custom" as const, light: { accent: "#c3141a", bar: "#2b1a12" }, dark: { bar: "#1e0f10" } };

test("applying a custom palette writes the style and the cache", () => {
  const { env, store, state } = fakeEnv("light");
  applyColours(custom, {}, env);
  assert.match(state.css ?? "", /--bb-maroon: #c3141a/);
  assert.equal(state.bar, "#2b1a12");
  const cached = JSON.parse(store.get(COLOURS_KEY) ?? "{}");
  assert.match(cached.css, /--bb-maroon: #c3141a/);
  assert.deepEqual(cached.bar, { light: "#2b1a12", dark: "#1e0f10" });
});

test("applyColours(null) removes the style and clears the cache", () => {
  const { env, store, state } = fakeEnv("dark");
  applyColours(custom, {}, env);
  applyColours(null, {}, env);
  assert.equal(state.css, null);
  assert.equal(store.has(COLOURS_KEY), false);
  assert.equal(state.bar, "#000000");
});

test("keep:false leaves the cache alone (the preview)", () => {
  const { env, store, state } = fakeEnv("light");
  applyColours(custom, { keep: false }, env);
  assert.match(state.css ?? "", /--bb-maroon/);
  assert.equal(store.has(COLOURS_KEY), false);
});

test("cachedBar reads the cached bar for a mode", () => {
  const { env } = fakeEnv("light");
  applyColours(custom, {}, env);
  assert.equal(cachedBar("dark", env.store), "#1e0f10");
  const { env: empty } = fakeEnv();
  assert.equal(cachedBar("dark", empty.store), null);
});
