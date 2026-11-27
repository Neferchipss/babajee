// Product import and update from a spreadsheet (.xlsx or .csv, read by
// stock-in/sheet.ts). One row per option. The first row names the columns,
// in any order and with any of the usual names ("Product", "Item name",
// "Selling price", "MRP", "Qty"...). Nothing is written until the plan has
// been shown and confirmed on the import page.
//
// Matching, row by row:
//   1. the SKU, when the row has one and an option already carries it;
//   2. otherwise the product's name (case, spaces and punctuation ignored)
//      within the row's category, or anywhere when the row names none, and
//      then the option by its label (no option: the product's only one).
// A matched option gets only the cells that are filled in and differ; an
// empty cell never wipes anything. An unmatched row adds a new product (or a
// new option of a matched product) as a draft, so nothing new shows on the
// shop before it has been looked at.
//
// Stock is set as a counted figure (the same as "Correct the count") and only
// for options that count stock. A buying price is recorded as a correction
// with the reason "Sheet import", so the profit history stays honest.

export type ImportField =
  | "name"
  | "category"
  | "option"
  | "price"
  | "compare_at"
  | "stock"
  | "sku"
  | "barcode"
  | "brand"
  | "description"
  | "hsn"
  | "gst_rate"
  | "purchase"
  | "weight_g"
  | "tags";

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Product name",
  category: "Category",
  option: "Option",
  price: "Selling price",
  compare_at: "MRP",
  stock: "Stock count",
  sku: "SKU",
  barcode: "Barcode",
  brand: "Brand",
  description: "Description",
  hsn: "HSN",
  gst_rate: "GST %",
  purchase: "Buying price",
  weight_g: "Weight (g)",
  tags: "Search keywords",
};

const ALIASES: Record<ImportField, string[]> = {
  name: ["name", "product", "product name", "item", "item name", "title", "product title"],
  category: ["category", "category name", "type", "collection", "department"],
  option: ["option", "variant", "variant name", "size", "colour", "color", "flavour", "flavor", "option name", "option value"],
  price: ["price", "selling price", "sale price", "rate", "sp", "retail price"],
  compare_at: ["mrp", "m.r.p", "m.r.p.", "compare at", "compare at price", "was", "was price", "old price", "original price"],
  stock: ["stock", "qty", "quantity", "stock qty", "in stock", "inventory", "count", "closing stock"],
  sku: ["sku", "code", "item code", "product code", "variant sku"],
  barcode: ["barcode", "ean", "upc", "gtin"],
  brand: ["brand", "vendor", "make", "manufacturer"],
  description: ["description", "details", "body", "about"],
  hsn: ["hsn", "hsn code", "hsn/sac"],
  gst_rate: ["gst", "gst %", "gst rate", "tax", "tax rate", "gst%"],
  purchase: ["purchase", "purchase price", "buying price", "cost", "cost price", "landing price", "cp"],
  weight_g: ["weight", "weight g", "weight (g)", "grams", "weight in grams"],
  tags: ["tags", "keywords", "search tags", "search keywords"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%/]+/g, " ")
    .trim();
// names compared without case, spaces or punctuation: "Raw Classic 1¼" = "raw-classic 1 ¼"
const nameKey = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

// which column holds which field: the header row, matched by the names above
export function mapHeaders(header: string[]): Partial<Record<ImportField, number>> {
  const out: Partial<Record<ImportField, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    for (const f of Object.keys(ALIASES) as ImportField[]) {
      if (out[f] !== undefined) continue;
      if (ALIASES[f].some((a) => norm(a) === n)) {
        out[f] = i;
        return;
      }
    }
  });
  // a sheet with an MRP column and no selling price sells at MRP: that
  // column is the price, not a higher price struck through
  if (out.price === undefined && out.compare_at !== undefined && ["mrp", "m r p"].includes(norm(header[out.compare_at]))) {
    out.price = out.compare_at;
    delete out.compare_at;
  }
  return out;
}

// "₹1,299.00" -> 1299; "" -> null; "abc" -> NaN
export function money(s: string): number | null {
  const t = s.replace(/[₹,\s]|rs\.?|inr/gi, "");
  if (!t) return null;
  return Number(t);
}

export type ExistingVariant = { id: string; label: string; price: number; compare_at: number | null; stock_qty: number; track_stock: boolean; sku: string | null; barcode: string | null; weight_g: number | null; unit_variant_id?: string | null };
export type ExistingProduct = { id: string; name: string; category_id: string; brand: string; description: string; hsn: string; gst_rate: number | null; tags: string[]; variants: ExistingVariant[] };
export type ExistingCategory = { id: string; slug: string; name: string };

type Change = { field: ImportField; from: string; to: string };
export type RowProblem = { row: number; message: string };

type VariantPatch = { price?: number; compare_at?: number | null; sku?: string; barcode?: string; weight_g?: number };
type ProductPatch = { brand?: string; description?: string; hsn?: string; gst_rate?: number; tags?: string[] };

export type PlanUpdate = {
  row: number;
  productId: string;
  variantId: string;
  name: string;
  option: string;
  product: ProductPatch;
  variant: VariantPatch;
  stock: number | null;
  purchase: number | null;
  changes: Change[];
};
export type PlanNewOption = { row: number; productId: string; name: string; option: string; variant: VariantPatch & { label: string }; stock: number | null; purchase: number | null };
export type PlanNewProduct = {
  key: string;
  rows: number[];
  name: string;
  categoryId: string;
  categoryName: string;
  product: ProductPatch;
  options: { row: number; label: string; variant: VariantPatch; stock: number | null; purchase: number | null }[];
};
export type ImportPlan = {
  updates: PlanUpdate[];
  newOptions: PlanNewOption[];
  newProducts: PlanNewProduct[];
  unchanged: number;
  problems: RowProblem[];
  // fields no column was found for
  unmapped: ImportField[];
};

const GST_OK = [0, 0.25, 3, 5, 12, 18, 28, 40];

export function planImport(rows: string[][], products: ExistingProduct[], categories: ExistingCategory[]): ImportPlan {
  const plan: ImportPlan = { updates: [], newOptions: [], newProducts: [], unchanged: 0, problems: [], unmapped: [] };
  const header = rows[0] ?? [];
  const col = mapHeaders(header);
  plan.unmapped = (Object.keys(FIELD_LABELS) as ImportField[]).filter((f) => col[f] === undefined);
  if (col.name === undefined && col.sku === undefined) {
    plan.problems.push({ row: 1, message: "No column for the product name or SKU: name one of the columns “Product” or “SKU”." });
    return plan;
  }

  const bySku = new Map<string, { p: ExistingProduct; v: ExistingVariant }>();
  for (const p of products) for (const v of p.variants) if (v.sku) bySku.set(v.sku.trim().toLowerCase(), { p, v });
  const catByKey = new Map<string, ExistingCategory>();
  for (const c of categories) {
    catByKey.set(nameKey(c.name), c);
    catByKey.set(nameKey(c.slug), c);
  }
  const fresh = new Map<string, PlanNewProduct>();
  const seenSku = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const at = r + 1; // as the spreadsheet numbers it
    const cell = (f: ImportField) => (col[f] === undefined ? "" : (row[col[f]!] ?? "").trim());
    if (row.every((c) => !String(c ?? "").trim())) continue;

    const name = cell("name");
    const sku = cell("sku");
    const option = cell("option");
    const catText = cell("category");
    const cat = catText ? catByKey.get(nameKey(catText)) : undefined;
    if (catText && !cat) {
      plan.problems.push({ row: at, message: `No category called “${catText}”. Add it first, or fix the spelling.` });
      continue;
    }

    // numbers
    const nums: Partial<Record<"price" | "compare_at" | "stock" | "gst_rate" | "purchase" | "weight_g", number | null>> = {};
    let bad = "";
    for (const f of ["price", "compare_at", "stock", "gst_rate", "purchase", "weight_g"] as const) {
      const t = cell(f);
      if (!t) continue;
      const n = f === "gst_rate" ? money(t.replace("%", "")) : money(t);
      if (n == null || !Number.isFinite(n) || n < 0) bad ||= `${FIELD_LABELS[f]} “${t}” isn't a number`;
      else if (f === "stock" && !Number.isInteger(n)) bad ||= `Stock “${t}” isn't a whole number`;
      else if (f === "gst_rate" && !GST_OK.includes(n)) bad ||= `GST ${t} isn't a GST rate (0, 3, 5, 12, 18, 28 or 40)`;
      else nums[f] = n;
    }
    if (bad) {
      plan.problems.push({ row: at, message: bad + "." });
      continue;
    }
    if (sku) {
      const k = sku.toLowerCase();
      if (seenSku.has(k)) {
        plan.problems.push({ row: at, message: `SKU ${sku} is on an earlier row too.` });
        continue;
      }
      seenSku.add(k);
    }

    const tags = cell("tags")
      ? cell("tags")
          .split(/[,;|]/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : null;
    const productBits: ProductPatch = {};
    if (cell("brand")) productBits.brand = cell("brand");
    if (cell("description")) productBits.description = cell("description");
    if (cell("hsn")) productBits.hsn = cell("hsn").replace(/\s/g, "");
    if (nums.gst_rate != null) productBits.gst_rate = nums.gst_rate;
    if (tags) productBits.tags = tags;
    const variantBits: VariantPatch = {};
    if (nums.price != null) variantBits.price = nums.price;
    if (nums.compare_at != null) variantBits.compare_at = nums.compare_at;
    if (sku) variantBits.sku = sku;
    if (cell("barcode")) variantBits.barcode = cell("barcode");
    if (nums.weight_g != null) variantBits.weight_g = nums.weight_g;
    const stock = nums.stock ?? null;
    const purchase = nums.purchase ?? null;
    if (variantBits.compare_at != null && variantBits.price != null && variantBits.compare_at <= variantBits.price) {
      plan.problems.push({ row: at, message: "The MRP should be above the selling price." });
      continue;
    }

    // 1. by SKU
    let hit = sku ? bySku.get(sku.toLowerCase()) : undefined;
    // 2. by name (+ category), then option
    let product = hit?.p;
    if (!hit && name) {
      const k = nameKey(name);
      const found = products.filter((p) => nameKey(p.name) === k && (!cat || p.category_id === cat.id));
      if (found.length > 1) {
        plan.problems.push({ row: at, message: `${found.length} products are called “${name}”: add the category or the SKU to say which.` });
        continue;
      }
      product = found[0];
      if (product) {
        const loose = product.variants.filter((v) => !v.unit_variant_id);
        const v = option ? loose.find((x) => nameKey(x.label) === nameKey(option)) : loose.length === 1 ? loose[0] : undefined;
        if (!option && loose.length > 1) {
          plan.problems.push({ row: at, message: `“${name}” has ${loose.length} options: add an Option column to say which.` });
          continue;
        }
        if (v) hit = { p: product, v };
      }
    }
    if (!hit && !name) {
      plan.problems.push({ row: at, message: `No product has SKU ${sku}, and the row has no name to add it under.` });
      continue;
    }
    if (hit && sku && hit.v.sku && hit.v.sku.toLowerCase() !== sku.toLowerCase()) {
      // matched by name, but the sheet's SKU belongs to another option
      if (bySku.has(sku.toLowerCase())) {
        plan.problems.push({ row: at, message: `SKU ${sku} already belongs to another option.` });
        continue;
      }
    }

    if (hit) {
      const { p, v } = hit;
      const changes: Change[] = [];
      const vp: VariantPatch = {};
      const pp: ProductPatch = {};
      const diff = (f: ImportField, from: unknown, to: unknown) => changes.push({ field: f, from: from == null || from === "" ? "–" : String(from), to: String(to) });
      if (variantBits.price != null && variantBits.price !== v.price) {
        vp.price = variantBits.price;
        diff("price", v.price, variantBits.price);
      }
      if (variantBits.compare_at != null && variantBits.compare_at !== v.compare_at) {
        vp.compare_at = variantBits.compare_at;
        diff("compare_at", v.compare_at, variantBits.compare_at);
      }
      if (variantBits.sku && variantBits.sku !== v.sku) {
        vp.sku = variantBits.sku;
        diff("sku", v.sku, variantBits.sku);
      }
      if (variantBits.barcode && variantBits.barcode !== v.barcode) {
        vp.barcode = variantBits.barcode;
        diff("barcode", v.barcode, variantBits.barcode);
      }
      if (variantBits.weight_g != null && variantBits.weight_g !== v.weight_g) {
        vp.weight_g = variantBits.weight_g;
        diff("weight_g", v.weight_g, variantBits.weight_g);
      }
      if (productBits.brand && productBits.brand !== p.brand) {
        pp.brand = productBits.brand;
        diff("brand", p.brand, productBits.brand);
      }
      if (productBits.description && productBits.description !== p.description) {
        pp.description = productBits.description;
        diff("description", p.description ? "(text)" : "", "(new text)");
      }
      if (productBits.hsn && productBits.hsn !== p.hsn) {
        pp.hsn = productBits.hsn;
        diff("hsn", p.hsn, productBits.hsn);
      }
      if (productBits.gst_rate != null && productBits.gst_rate !== p.gst_rate) {
        pp.gst_rate = productBits.gst_rate;
        diff("gst_rate", p.gst_rate == null ? "shop's" : p.gst_rate, productBits.gst_rate);
      }
      if (productBits.tags && productBits.tags.join(",") !== p.tags.join(",")) {
        pp.tags = productBits.tags;
        diff("tags", p.tags.join(", "), productBits.tags.join(", "));
      }
      let st: number | null = null;
      if (stock != null) {
        if (!v.track_stock) plan.problems.push({ row: at, message: `“${p.name}” doesn't count stock, so its stock (${stock}) was left alone.` });
        else if (stock !== v.stock_qty) {
        st = stock;
        diff("stock", v.stock_qty, stock);
      }
      }
      if (purchase != null) diff("purchase", "", purchase);
      if (!changes.length) {
        plan.unchanged++;
        continue;
      }
      plan.updates.push({ row: at, productId: p.id, variantId: v.id, name: p.name, option: v.label, product: pp, variant: vp, stock: st, purchase, changes });
      continue;
    }

    // a new option of a product that is there
    if (product) {
      if (sku && bySku.has(sku.toLowerCase())) {
        plan.problems.push({ row: at, message: `SKU ${sku} already belongs to another option.` });
        continue;
      }
      plan.newOptions.push({ row: at, productId: product.id, name: product.name, option, variant: { ...variantBits, label: option }, stock, purchase });
      continue;
    }

    // a new product (its rows gathered by name + category)
    if (!cat) {
      plan.problems.push({ row: at, message: `“${name}” is new: add its category so it goes on the right shelf.` });
      continue;
    }
    const key = `${cat.id}|${nameKey(name)}`;
    let np = fresh.get(key);
    if (!np) {
      np = { key, rows: [], name, categoryId: cat.id, categoryName: cat.name, product: {}, options: [] };
      fresh.set(key, np);
      plan.newProducts.push(np);
    }
    if (np.options.some((o) => nameKey(o.label) === nameKey(option || "Default"))) {
      plan.problems.push({ row: at, message: `“${name}”${option ? ` · ${option}` : ""} is on an earlier row too.` });
      continue;
    }
    np.rows.push(at);
    np.product = { ...np.product, ...productBits };
    np.options.push({ row: at, label: option || "Default", variant: variantBits, stock, purchase });
  }
  return plan;
}

// the plan in a line: "12 to update, 3 new options, 5 new products, 40 already the same, 2 problems"
export function planSummary(p: ImportPlan): string {
  const bits = [
    p.updates.length && `${p.updates.length} to update`,
    p.newOptions.length && `${p.newOptions.length} new option${p.newOptions.length === 1 ? "" : "s"}`,
    p.newProducts.length && `${p.newProducts.length} new product${p.newProducts.length === 1 ? "" : "s"}`,
    p.unchanged && `${p.unchanged} already the same`,
    p.problems.length && `${p.problems.length} to check`,
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : "Nothing to do";
}

// a sheet to start from, with every column the import reads
export const TEMPLATE_HEADER = ["Product", "Category", "Option", "Selling price", "MRP", "Stock", "SKU", "Barcode", "Brand", "HSN", "GST %", "Buying price", "Weight (g)", "Search keywords", "Description"];
