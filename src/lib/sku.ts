// A suggested SKU for an option: category, product and option, short and
// upper-case. "grinder", "zinc-alloy-grinder-50mm", "Black" → GRI-ZAG50MM-BLA.
// Only a suggestion: the shop can type its own, and the database keeps every
// SKU different (0003, 0028).
const words = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);

export function suggestSku(categorySlug: string, productSlug: string, option: string, many: boolean) {
  const c = words(categorySlug);
  const cat = c.length > 1 ? c.map((w) => w[0]).join("") : (c[0] ?? "").slice(0, 3);
  // numbers kept whole (sizes, counts), words by their first letter
  const prod = words(productSlug)
    .map((w) => (/\d/.test(w) ? w : w[0]))
    .join("")
    .slice(0, 8);
  const opt = many ? words(option).map((w) => (/\d/.test(w) ? w : w.slice(0, 3))).join("").slice(0, 6) : "";
  return [cat, prod, opt].filter(Boolean).join("-");
}
