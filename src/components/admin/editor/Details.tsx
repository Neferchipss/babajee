"use client";

import { type ReactNode, useEffect, useState } from "react";
import { absUrl } from "@/lib/site";
import { autoDescription, autoTitle, DESC_MAX, fullTitle, TITLE_MAX } from "@/lib/seo";
import { suggestSku } from "@/lib/sku";
import { type AdminProduct, type AdminVariant, type Spec } from "@/lib/admin-data";
import { mainPrice } from "./ProductBasics";

// The last stock changes for this product's options: sales, cancelled orders put
// back, refunds restocked, and counts edited by hand.
export const REASON = { sale: "Sold", cancel: "Order cancelled", refund: "Refund restock", return: "Returned", edit: "Order edited", undo: "Refund reversed", manual: "Manual edit", stock_in: "Purchase", void: "Bill cancelled", correction: "Stock adjustment" } as const;
export type Move = Awaited<ReturnType<typeof import("@/lib/orders-db").stockHistory>>[number];
export function StockHistory({ variants }: { variants: AdminVariant[] }) {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [bills, setBills] = useState<Map<string, string>>(new Map());
  // read again whenever a count changes
  const counts = variants.map((v) => `${v.id}:${v.stock_qty}`).join(",");
  useEffect(() => {
    let live = true;
    import("@/lib/orders-db")
      .then((m) => m.stockHistory(counts.split(",").map((x) => x.split(":")[0])))
      .then(async (r) => {
        const top = r.slice(0, 12);
        // "Stock in" rows name their bill
        const bills = await import("@/lib/stock-in/db").then((d) => d.billNumbers([...new Set(top.flatMap((m) => (m.receipt_id ? [m.receipt_id] : [])))])).catch(() => new Map<string, string>());
        if (live) {
          setBills(bills);
          setMoves(top);
        }
      })
      .catch(() => live && setMoves([]));
    return () => {
      live = false;
    };
  }, [counts]);
  if (!moves?.length) return <p className="ape-hint">No stock changes yet.</p>;
  const many = variants.length > 1;
  return (
    <ol className="ape-history">
      {moves.map((m) => (
        <li key={m.id}>
          <span>
            {REASON[m.reason]}
            {m.order_number && ` · ${m.order_number}`}
            {m.receipt_id && bills.get(m.receipt_id) && ` · bill ${bills.get(m.receipt_id)}`}
            {m.note && <small> · {m.note}</small>}
            {many && m.label && <small> · {m.label}</small>}
          </span>
          <b className={m.delta < 0 ? "is-down" : "is-up"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</b>
          <small>{m.qty_after} left</small>
          <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</time>
        </li>
      ))}
    </ol>
  );
}
// Shopify-style product types the shop is likely to use; anything can be typed
export const TYPE_HINTS = ["Rolling papers", "Cones", "Filter tips", "Rolling tray", "Grinder", "Lighter", "Ashtray", "Storage", "Bong", "Pipe", "Cigar", "Tobacco", "Accessory", "Merch"];
// Tags as chips: type and press Enter or a comma to add, × to take one off.
// For grouping and finding products ("gift", "under 500", "new in").
export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add(raw: string) {
    const fresh = raw
      .split(",")
      .map((t) => t.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .filter((t, i, all) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()) && all.findIndex((y) => y.toLowerCase() === t.toLowerCase()) === i);
    setDraft("");
    if (fresh.length) onChange([...tags, ...fresh].slice(0, 30));
  }
  return (
    <div className="ape-tags">
      {tags.map((t) => (
        <span key={t} className="ape-tag">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        aria-labelledby="ape-tags-label"
        value={draft}
        placeholder={tags.length ? "Add another" : "gift, under 500, new in…"}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
    </div>
  );
}
// The product's search-engine listing: what Google shows, and what WhatsApp
// or Instagram show when someone shares its link. Both fields are optional;
// left empty, they're written from the product (lib/seo.ts), and the preview
// shows exactly that.
export function SeoListing({
  product,
  categoryName,
  onSave,
}: {
  product: AdminProduct;
  categoryName: string;
  onSave: (patch: { seo_title?: string; seo_description?: string }) => void;
}) {
  const [title, setTitle] = useState(product.seo_title);
  const [desc, setDesc] = useState(product.seo_description);
  const base = { name: product.name, category: categoryName, description: product.description, brand: product.brand, price: mainPrice(product) || null };
  const autoT = autoTitle(base);
  const autoD = autoDescription(base);
  const shownT = fullTitle(title.trim() || autoT);
  const shownD = desc.trim() || autoD;
  const slugPath = ["shop", product.category_slug ?? "", product.slug].filter(Boolean).join(" › ");
  const count = (n: number, max: number) => (
    <span className={`ape-count ${n > max ? "is-over" : ""}`}>
      {n}/{max}
    </span>
  );
  return (
    <section className="ape-fields ape-seo">
      <h3>Search engine listing</h3>
      <p className="ape-hint">How it shows on Google and when its link is shared. Leave empty to use what&apos;s written from the product. Changes reach Google after the next site update.</p>
      <div className="ape-serp" aria-label="Preview of the search result">
        <span className="ape-serp-site">
          <i aria-hidden="true">B</i>
          <span>
            Babajee
            <small>{absUrl("/").replace(/^https?:\/\//, "").replace(/\/$/, "")} › {slugPath}</small>
          </span>
        </span>
        <b className="ape-serp-title">{shownT.length > TITLE_MAX + 11 ? `${shownT.slice(0, TITLE_MAX + 10)}…` : shownT}</b>
        <span className="ape-serp-desc">{shownD}</span>
      </div>
      <label className="ape-field ape-field--wide">
        <span className="ape-seo-label">
          Page title {count(shownT.length, TITLE_MAX)}
        </span>
        <input
          value={title}
          maxLength={120}
          placeholder={autoT}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== product.seo_title && onSave({ seo_title: title.trim() })}
        />
      </label>
      <label className="ape-field ape-field--wide">
        <span className="ape-seo-label">
          Description {count(shownD.length, DESC_MAX)}
        </span>
        <textarea
          rows={3}
          value={desc}
          maxLength={320}
          placeholder={autoD}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc.trim() !== product.seo_description && onSave({ seo_description: desc.trim() })}
        />
      </label>
      {(product.seo_title || product.seo_description) && (
        <button
          type="button"
          className="ape-link"
          onClick={() => {
            setTitle("");
            setDesc("");
            onSave({ seo_title: "", seo_description: "" });
          }}
        >
          Go back to the automatic listing
        </button>
      )}
    </section>
  );
}
// Codes and the "was" price for each option. The SKU is the shop's own stock
// code (on orders and exports); the barcode is the number printed under the
// bars; the compare-at price is the higher price the shop strikes through
// beside the real one, with "₹x OFF".
export function VariantCodes({ product, categorySlug, onSave }: { product: AdminProduct; categorySlug: string; onSave: (id: string, patch: Partial<AdminVariant>) => Promise<boolean> }) {
  const many = product.variants.length > 1;
  const empty = product.variants.filter((v) => !v.sku);
  return (
    <section className="ape-fields ape-codes">
      <div className="ape-codes-head">
        <h3>Codes and was-price</h3>
        {empty.length > 0 && (
          <button
            type="button"
            className="ape-chip"
            onClick={async () => {
              for (const v of empty) await onSave(v.id, { sku: suggestSku(categorySlug, product.slug, v.label, many) });
            }}
          >
            Fill in {empty.length === product.variants.length ? "SKUs" : `${empty.length} missing SKU${empty.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
      <p className="ape-hint">SKU is your own stock code; it goes on orders and exports. Compare-at is the higher price shown struck through, like ₹499 → ₹399 with ₹100 OFF.</p>
      <div className={`ape-codes-grid ${many ? "is-many" : ""}`}>
        <span className="ape-codes-th">{many ? "Option" : ""}</span>
        <span className="ape-codes-th">SKU</span>
        <span className="ape-codes-th">Barcode</span>
        <span className="ape-codes-th">Compare-at price</span>
        {product.variants.map((v) => (
          <CodeRow key={`${v.id}|${v.sku}|${v.barcode}|${v.compare_at}`} variant={v} many={many} hint={suggestSku(categorySlug, product.slug, v.label, many)} onSave={(patch) => onSave(v.id, patch)} />
        ))}
      </div>
    </section>
  );
}
export function CodeRow({ variant: v, many, hint, onSave }: { variant: AdminVariant; many: boolean; hint: string; onSave: (patch: Partial<AdminVariant>) => void }) {
  const [sku, setSku] = useState(v.sku ?? "");
  const [code, setCode] = useState(v.barcode ?? "");
  const [was, setWas] = useState(v.compare_at ? String(v.compare_at) : "");
  const wasN = Number(was) || 0;
  const below = wasN > 0 && v.price > 0 && wasN <= v.price;
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();
  return (
    <>
      <span className="ape-codes-opt">{many ? v.label : ""}</span>
      <input
        aria-label={`${v.label} SKU`}
        value={sku}
        placeholder={hint}
        spellCheck={false}
        onChange={(e) => setSku(e.target.value.toUpperCase())}
        onKeyDown={enter}
        onBlur={() => sku.trim() !== (v.sku ?? "") && onSave({ sku: sku.trim() || null })}
      />
      <input
        aria-label={`${v.label} barcode`}
        value={code}
        inputMode="numeric"
        placeholder="EAN or UPC"
        spellCheck={false}
        onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
        onKeyDown={enter}
        onBlur={() => code.trim() !== (v.barcode ?? "") && onSave({ barcode: code.trim() || null })}
      />
      <span className="ape-codes-was">
        <span className={`ape-money ${below ? "is-below" : ""}`}>
          <i>₹</i>
          <input
            aria-label={`${v.label} compare-at price`}
            inputMode="decimal"
            value={was}
            placeholder="None"
            onChange={(e) => setWas(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={enter}
            onBlur={() => (wasN || null) !== v.compare_at && onSave({ compare_at: wasN || null })}
          />
        </span>
        {wasN > v.price && v.price > 0 ? (
          <small className="ape-codes-off">{Math.round(((wasN - v.price) / wasN) * 100)}% off</small>
        ) : below ? (
          <small className="ape-codes-warn">Not above the price, so it won&apos;t show</small>
        ) : null}
      </span>
    </>
  );
}
// Each option's packed weight and size (0062): a box weighs what its pieces
// do and more, so boxes get their own. For shipping, and shown on the product
// page. Empty when not known.
export function WeightSize({ product, onSave }: { product: AdminProduct; onSave: (id: string, patch: Partial<AdminVariant>) => Promise<boolean> }) {
  const many = product.variants.length > 1;
  return (
    <section className="ape-fields ape-codes">
      <h3>Weight and size</h3>
      <p className="ape-hint">Packed, as it ships: weight in grams, size in centimetres (length × width × height).</p>
      <div className={`ape-codes-grid ape-size-grid ${many ? "is-many" : ""}`}>
        <span className="ape-codes-th">{many ? "Option" : ""}</span>
        <span className="ape-codes-th">Weight (g)</span>
        <span className="ape-codes-th">L × W × H (cm)</span>
        {product.variants.map((v) => (
          // keyed on the option alone: a save re-reads the product, and the row
          // must not start over while the next box is being typed in
          <SizeRow key={v.id} variant={v} many={many} onSave={(patch) => onSave(v.id, patch)} />
        ))}
      </div>
    </section>
  );
}
export function SizeRow({ variant: v, many, onSave }: { variant: AdminVariant; many: boolean; onSave: (patch: Partial<AdminVariant>) => void }) {
  const str = (n: number | null) => (n == null ? "" : String(n));
  const [w, setW] = useState(str(v.weight_g));
  const [l, setL] = useState(str(v.length_cm));
  const [wd, setWd] = useState(str(v.width_cm));
  const [h, setH] = useState(str(v.height_cm));
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();
  // empty or zero: not known
  const num = (x: string) => (Number(x) > 0 ? Math.round(Number(x) * 10) / 10 : null);
  const field = (label: string, value: string, set: (x: string) => void, key: keyof AdminVariant) => (
    <input
      aria-label={`${v.label} ${label}`}
      inputMode="decimal"
      value={value}
      placeholder="–"
      onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ""))}
      onKeyDown={enter}
      onBlur={() => num(value) !== v[key] && onSave({ [key]: num(value) } as Partial<AdminVariant>)}
    />
  );
  return (
    <>
      <span className="ape-codes-opt">{many ? v.label : ""}</span>
      {field("weight in grams", w, setW, "weight_g")}
      <span className="ape-size-lwh">
        {field("length in cm", l, setL, "length_cm")}
        <i aria-hidden="true">×</i>
        {field("width in cm", wd, setWd, "width_cm")}
        <i aria-hidden="true">×</i>
        {field("height in cm", h, setH, "height_cm")}
      </span>
    </>
  );
}
// Links to the product's videos (0062): YouTube, or a direct .mp4. Up to six,
// one a line; shown on the product's page.
export function Videos({ urls, onSave }: { urls: string[]; onSave: (urls: string[]) => void }) {
  const [text, setText] = useState(urls.join("\n"));
  const list = text
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const bad = list.filter((x) => !/^https:\/\/\S+$/.test(x));
  const ok = !bad.length && list.length <= 6;
  return (
    <section className="ape-fields">
      <h3>Videos</h3>
      <label className="ape-field">
        <span>Links, one a line (YouTube, or a direct .mp4 link). Up to six.</span>
        <textarea
          rows={3}
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=…"
          value={text}
          aria-invalid={!ok}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => ok && list.join("\n") !== urls.join("\n") && onSave(list)}
        />
      </label>
      {bad.length > 0 && <p className="ape-err">Each link starts with https:// ({bad[0]} doesn&apos;t).</p>}
      {list.length > 6 && <p className="ape-err">Six videos at most.</p>}
    </section>
  );
}
// A section folded to one line: its name and what's in it. Open it to edit.
export function Fold({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <details className="ape-fold">
      <summary>
        <span className="ape-fold-title">{title}</span>
        <span className="ape-fold-sum">{summary}</span>
        <i aria-hidden="true">›</i>
      </summary>
      <div className="ape-fold-body">{children}</div>
    </details>
  );
}
// Specifications: label and value rows ("Material", "Aluminium"), shown as
// a table on the product page. Saved when a field is left.
export function SpecsEditor({ specs, onSave }: { specs: Spec[]; onSave: (s: Spec[]) => void }) {
  const [rows, setRows] = useState<Spec[]>(specs.length ? specs : []);
  const clean = (list: Spec[]) => list.map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((r) => r.label && r.value);
  const save = (list: Spec[]) => {
    const c = clean(list);
    if (JSON.stringify(c) !== JSON.stringify(specs)) onSave(c);
  };
  const set = (i: number, k: keyof Spec, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <section className="ape-fields">
      <h3>Specifications</h3>
      {rows.length === 0 && <p className="ape-hint">Material, size, what&apos;s in the box… shown as a table on the product page.</p>}
      <div className="ape-specs">
        {rows.map((r, i) => (
          <div key={i} className="ape-spec">
            <input value={r.label} placeholder="Material" maxLength={40} aria-label="Specification" onChange={(e) => set(i, "label", e.target.value)} onBlur={() => save(rows)} />
            <input value={r.value} placeholder="Aluminium" maxLength={120} aria-label="Value" onChange={(e) => set(i, "value", e.target.value)} onBlur={() => save(rows)} />
            <button
              type="button"
              className="ape-icon"
              aria-label={`Remove ${r.label || "row"}`}
              onClick={() => {
                const next = rows.filter((_, j) => j !== i);
                setRows(next);
                save(next);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="ape-add" onClick={() => setRows((rs) => [...rs, { label: "", value: "" }])}>
        + Add a row
      </button>
    </section>
  );
}
// This product's low-stock mark: empty uses the shop's (Settings).
export function LowMark({ product, onSave }: { product: AdminProduct; onSave: (n: number | null) => void }) {
  const [v, setV] = useState(product.low_stock_at == null ? "" : String(product.low_stock_at));
  return (
    <label className="ape-field">
      <span>Reorder level</span>
      <input
        inputMode="numeric"
        value={v}
        placeholder="Shop's default"
        onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
        onBlur={() => {
          const n = v === "" ? null : Math.min(10000, Number(v));
          if (n !== product.low_stock_at) onSave(n);
        }}
      />
    </label>
  );
}
