// Small copies of the product photos for grids, cards and swatches, where a
// photo shows at ~180px: public/products/<slug>/sm/<n>.webp, 480px square.
// The full 1000px photos stay for the product page. Run after adding photos:
//   node scripts/make-thumbs.mjs
// (skips thumbs that are already newer than their photo)
import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("../public/products/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
let made = 0;
for (const slug of readdirSync(ROOT)) {
  const dir = join(ROOT, slug);
  if (!statSync(dir).isDirectory()) continue;
  const out = join(dir, "sm");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".webp")) continue;
    const src = join(dir, f);
    const dst = join(out, f);
    if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue;
    mkdirSync(out, { recursive: true });
    await sharp(src).resize(480, 480, { fit: "inside" }).webp({ quality: 78, effort: 5 }).toFile(dst);
    made++;
  }
}
console.log(`thumbs: ${made} made`);
