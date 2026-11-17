import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestTags } from "./subcategory-rules.ts";

const tags = (cat: string, name: string) => suggestTags(cat, name).map((t) => t.tag);

// real names from the catalogue
test("bongs: material, size bucket, perc, style", () => {
  assert.deepEqual(tags("bong", 'Showerhead Perc Glass Beaker Bong 14"'), ["Glass", '14" to 16"', "Showerhead perc", "Beaker"]);
  assert.deepEqual(tags("bong", "10'' Acrylic Bong"), ["Acrylic", '9" to 12"']);
  assert.deepEqual(tags("bong", 'Heavy Glass Beaker Bong 20"'), ["Glass", '20" and up', "Beaker"]);
  assert.deepEqual(tags("bong", "Micro Bong"), ["Mini"]);
});

test("rolling papers", () => {
  assert.deepEqual(tags("rolling-paper", "Raw Black Ks + Tips"), ["King size", "With tips"]);
  assert.deepEqual(tags("rolling-paper", "Raw Hemp Classic 11/4"), ["1¼", "Hemp"]);
  assert.deepEqual(tags("rolling-paper", "Raw Classic Ks"), ["King size", "Unbleached / brown"]);
  assert.deepEqual(tags("rolling-paper", "Elements blue 5m Roll"), ["Rolls"]);
  assert.deepEqual(tags("rolling-paper", "Rizla Bamboo 78mm"), ["Regular / single wide", "Bamboo"]);
});

test("others", () => {
  assert.deepEqual(tags("bong-accessory", "14mm Cone Glass Bowl"), ["14mm", "Bowls"]);
  assert.deepEqual(tags("rolling-tray", "RAW BLACK METAL ROLLING TRAY - SMALL"), ["Small", "Metal"]);
  assert.deepEqual(tags("grinder", "Babajee Metal Grinder 50mm"), ["Metal", "50mm"]);
  assert.deepEqual(tags("pipe", '4" Soapstone Chillum'), ["Soapstone", "Chillums"]);
  assert.deepEqual(tags("storage", "Raw x Ryot Smell Proof Pouch"), ["Pouches & wallets", "Smell proof"]);
});

test("a category without rules suggests nothing", () => {
  assert.deepEqual(tags("lighter", "Clipper Lighter"), []);
});
