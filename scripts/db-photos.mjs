// Before a build: the product photos added in the admin (Supabase Storage,
// bucket product-photos, rows in product_images) into
// src/lib/product-photos-db.json, keyed by product slug. The shop is built as
// static pages, so this is how an uploaded photo reaches it: on the next build
// (each push to main deploys one). photosFor() prefers these to the shoot's.
//
//   node --env-file-if-exists=.env.local scripts/db-photos.mjs   (npm run prebuild)
//
// Without the database (no keys, offline, the bucket not made yet) it keeps
// the file it has and the build goes on.
import { existsSync, writeFileSync } from "node:fs";

const OUT = new URL("../src/lib/product-photos-db.json", import.meta.url);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function keep(why) {
  if (!existsSync(OUT)) writeFileSync(OUT, "{}\n");
  console.log(`[db-photos] ${why}; keeping the photo list as it is`);
  process.exit(0);
}

if (!url || !key) keep("no database keys");

let rows;
try {
  const q = "select=storage_path,sort_order,products(slug),product_variants(label,sort_order)&order=sort_order";
  const res = await fetch(`${url}/rest/v1/product_images?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) keep(`the database answered ${res.status}`);
  rows = await res.json();
} catch (e) {
  keep(`the database could not be reached (${e.message})`);
}

const out = {};
for (const r of rows) {
  const slug = r.products?.slug; // a hidden product is not readable here, and has no page anyway
  if (!slug) continue;
  const src = `${url}/storage/v1/object/public/product-photos/${r.storage_path}`;
  const p = (out[slug] ??= { all: [], byOption: {} });
  if (r.product_variants?.label) (p.byOption[r.product_variants.label] ??= []).push(src);
  else p.all.push(src);
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`[db-photos] ${rows.length} photos for ${Object.keys(out).length} products`);
