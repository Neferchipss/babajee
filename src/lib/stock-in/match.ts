export type Candidate = {
  variant_id: string;
  product: string;
  option: string;
  sku: string | null;
};

export type Mapping = {
  name?: number;
  option?: number;
  sku?: number;
  qty: number;
  price?: number;
  gst?: number;
  headerRow: number;
};

export type MatchRow = {
  /** 0-based index into the input rows (the UI adds 1 for display). */
  row: number;
  status: "matched" | "unsure" | "missing" | "skip";
  variant_id: string | null;
  options: string[];
  qty: number;
  price: number | null;
  gst: number | null;
  text: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseNumber(s: string): number | null {
  const m = /-?\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?|(?<!\w)-?\.\d+/.exec(s);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const accounting = /^\s*\(.*\)\s*$/.test(s) && n > 0;
  return accounting ? -n : n;
}

type Field = "sku" | "gst" | "price" | "qty" | "option" | "name";
// Order matters: "unit price" must be a price, not a quantity.
const HEADERS: [Field, RegExp][] = [
  ["sku", /sku|barcode|item ?code|product ?code|^code$/],
  ["gst", /gst|tax|vat/],
  ["price", /rate|price|cost|buying|purchase/],
  ["qty", /qty|quantity|qnty|pcs|pieces|units?$|^nos?$/],
  ["option", /variant|option|size|flavou?r|colou?r|^type$/],
  ["name", /item|product|description|name|particulars|title/],
];

export function guessMapping(rows: string[][]): Mapping | null {
  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r++) {
    const found: Partial<Record<Field, number>> = {};
    rows[r].forEach((cell, c) => {
      const h = cell.trim().toLowerCase();
      if (!h) return;
      for (const [field, re] of HEADERS) {
        if (found[field] === undefined && re.test(h)) {
          found[field] = c;
          return;
        }
      }
    });
    if (found.qty !== undefined && (found.name !== undefined || found.sku !== undefined)) {
      const m: Mapping = { qty: found.qty, headerRow: r };
      if (found.name !== undefined) m.name = found.name;
      if (found.option !== undefined) m.option = found.option;
      if (found.sku !== undefined) m.sku = found.sku;
      if (found.price !== undefined) m.price = found.price;
      if (found.gst !== undefined) m.gst = found.gst;
      return m;
    }
  }
  return null;
}

export function matchRows(rows: string[][], m: Mapping, catalogue: Candidate[]): MatchRow[] {
  // A SKU only identifies a variant when exactly one catalogue entry carries it.
  const skuCount = new Map<string, number>();
  for (const c of catalogue) {
    const k = c.sku ? norm(c.sku) : "";
    if (k) skuCount.set(k, (skuCount.get(k) ?? 0) + 1);
  }
  const bySku = new Map<string, Candidate>();
  const dupSku = new Map<string, Candidate[]>();
  for (const c of catalogue) {
    const k = c.sku ? norm(c.sku) : "";
    if (!k) continue;
    if (skuCount.get(k) === 1) bySku.set(k, c);
    else dupSku.set(k, [...(dupSku.get(k) ?? []), c]);
  }

  const out: MatchRow[] = [];
  for (let i = m.headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => c.trim() === "")) continue;
    const cell = (c: number | undefined) => (c === undefined ? "" : (row[c] ?? "").trim());
    const name = cell(m.name);
    const option = cell(m.option);
    const sku = cell(m.sku);
    const text = [name, option].filter(Boolean).join(" ") || sku;
    const qty = parseNumber(cell(m.qty)) ?? 0;
    const base = {
      row: i,
      qty,
      price: m.price === undefined ? null : parseNumber(cell(m.price)),
      gst: m.gst === undefined ? null : parseNumber(cell(m.gst)),
      text,
    };
    if (qty <= 0) {
      out.push({ ...base, status: "skip", variant_id: null, options: [] });
      continue;
    }

    const skuHit = sku ? bySku.get(norm(sku)) : undefined;
    if (skuHit) {
      out.push({ ...base, status: "matched", variant_id: skuHit.variant_id, options: [] });
      continue;
    }

    const nName = norm(name);
    const nBoth = norm(name + option);
    const exact = nName
      ? catalogue.filter(
          (c) =>
            (norm(c.product) === nName && norm(c.option) === norm(option)) ||
            (nBoth !== "" && norm(c.product + c.option) === nBoth),
        )
      : [];
    if (exact.length === 1) {
      out.push({ ...base, status: "matched", variant_id: exact[0].variant_id, options: [] });
      continue;
    }

    const collided = sku ? (dupSku.get(norm(sku)) ?? []) : [];
    if (collided.length) {
      out.push({
        ...base,
        status: "unsure",
        variant_id: null,
        options: collided.slice(0, 5).map((c) => c.variant_id),
      });
      continue;
    }

    const nText = norm(text);
    const near =
      nText.length >= 3
        ? catalogue.filter((c) => {
            const a = norm(c.product);
            const b = norm(c.product + c.option);
            return [a, b].some((x) => x && (x.includes(nText) || nText.includes(x)));
          })
        : [];
    const options = (exact.length > 1 ? exact : near).slice(0, 5).map((c) => c.variant_id);
    out.push({
      ...base,
      status: options.length ? "unsure" : "missing",
      variant_id: null,
      options,
    });
  }
  return out;
}
