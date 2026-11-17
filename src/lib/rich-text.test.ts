import { test } from "node:test";
import assert from "node:assert/strict";
import { blocks, inline } from "./rich-text.ts";

test("blocks: headings, lists, paragraphs", () => {
  assert.deepEqual(blocks("Hello\nthere\n\n## Story\nWe began.\n\n- one\n- two"), [
    { type: "p", text: "Hello\nthere" },
    { type: "h", text: "Story" },
    { type: "p", text: "We began." },
    { type: "ul", items: ["one", "two"] },
  ]);
});

test("inline: bold and safe links only", () => {
  assert.deepEqual(inline("a **b** [c](/shop/) [d](javascript:alert(1)) [e](https://x.in)"), [
    { t: "text", v: "a " },
    { t: "b", v: "b" },
    { t: "text", v: " " },
    { t: "a", v: "c", href: "/shop/" },
    { t: "text", v: " [d](javascript:alert(1)) " },
    { t: "a", v: "e", href: "https://x.in" },
  ]);
});
