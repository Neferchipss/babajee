"use client";

import { useMemo, useRef, useState } from "react";
import { readSheet } from "@/lib/stock-in/sheet";
import { guessMapping, matchRows, type Candidate, type Mapping, type MatchRow } from "@/lib/stock-in/match";
import { paisa } from "@/lib/stock-in/price";
import { lineName, type Line } from "./LineEditor";
import "./stockin.css";

type Filter = "matched" | "unsure" | "missing" | "skip";
// a person's decision for a row: a chosen option, or leave it out
type Pick = string | "leave";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "matched", label: "Matched" },
  { key: "unsure", label: "Unsure" },
  { key: "missing", label: "Not found" },
  { key: "skip", label: "Skipped" },
];

const colName = (i: number) => {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
};

// Upload a supplier's sheet (.xlsx, .xls or .csv): choose which column is which,
// check how each row matched your products, then hand the lines to the form.
export default function SheetImport({
  catalogue,
  onLines,
  onCancel,
  gstOf,
  existing,
}: {
  catalogue: Candidate[];
  onLines: (l: Line[]) => void;
  onCancel?: () => void;
  gstOf?: (variant_id: string) => number;
  existing?: Line[];
}) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({ qty: -1, headerRow: 0 });
  const [guessed, setGuessed] = useState(false);
  const [review, setReview] = useState(false);
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());
  const [filter, setFilter] = useState<Filter>("matched");
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(catalogue.map((c) => [c.variant_id, c])), [catalogue]);

  async function load(f: File | undefined) {
    if (!f) return;
    setErr("");
    try {
      const parsed = readSheet({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      if (!parsed.some((r) => r.some((c) => c.trim() !== ""))) throw new Error("That file has nothing in it.");
      const g = guessMapping(parsed);
      setRows(parsed);
      setFileName(f.name);
      setMapping(g ?? { qty: -1, headerRow: 0 });
      setGuessed(g !== null);
      setReview(false);
      setPicks(new Map());
    } catch (x) {
      setRows(null);
      setErr(x instanceof Error ? x.message : "That file couldn't be read.");
    }
  }

  const mappingOk = mapping.qty >= 0 && (mapping.name !== undefined || mapping.sku !== undefined);
  const matches = useMemo(() => (rows && review && mappingOk ? matchRows(rows, mapping, catalogue) : []), [rows, review, mapping, mappingOk, catalogue]);

  // a row with a decision counts as matched; "leave out" counts as skipped
  const effective = (m: MatchRow): { status: Filter; variant_id: string | null } => {
    const p = picks.get(m.row);
    if (p === "leave") return { status: "skip", variant_id: null };
    if (p) return { status: "matched", variant_id: p };
    return { status: m.status, variant_id: m.variant_id };
  };
  const counts: Record<Filter, number> = { matched: 0, unsure: 0, missing: 0, skip: 0 };
  for (const m of matches) counts[effective(m).status]++;

  // Rows of one option merge only when price and GST rate are identical (a
  // missing price matches only another missing price); otherwise they are a
  // conflict the person must fix, since one price can't stand for both.
  const { lines, conflicts } = useMemo(() => {
    const same = (x: number, y: number) => Object.is(x, y);
    const merged = new Map<string, Line>();
    const rowsOf = new Map<string, number[]>();
    const bad = new Map<string, string>();
    const existingBy = new Map((existing ?? []).map((l) => [l.variant_id, l]));
    for (const m of matches) {
      const e = effective(m);
      if (e.status !== "matched" || !e.variant_id) continue;
      const qty = Math.round(m.qty);
      if (qty < 1) continue;
      // to the paisa, as the database keeps it
      const price = m.price !== null && m.price >= 0 ? paisa(m.price) : NaN;
      const gst = m.gst !== null && m.gst >= 0 && m.gst <= 100 ? m.gst : (gstOf?.(e.variant_id) ?? 18);
      const prev = merged.get(e.variant_id);
      rowsOf.set(e.variant_id, [...(rowsOf.get(e.variant_id) ?? []), m.row + 1]);
      if (!prev) {
        merged.set(e.variant_id, { variant_id: e.variant_id, qty, unit_price: price, gst_rate: gst });
        const onForm = existingBy.get(e.variant_id);
        if (onForm && !(same(onForm.unit_price, price) && onForm.gst_rate === gst))
          bad.set(e.variant_id, `Row ${m.row + 1} is an option already on the form, at a different price or GST. Fix the sheet or leave it out.`);
      } else if (same(prev.unit_price, price) && prev.gst_rate === gst) merged.set(e.variant_id, { ...prev, qty: prev.qty + qty });
      else {
        const r = rowsOf.get(e.variant_id) ?? [];
        bad.set(e.variant_id, `Rows ${r.slice(0, -1).join(", ")} and ${r[r.length - 1]} are the same option at different prices. Fix the sheet or leave one out.`);
      }
    }
    return { lines: [...merged.values()], conflicts: [...bad.values()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, picks, gstOf, existing]);

  const noPrice = lines.filter((l) => !Number.isFinite(l.unit_price)).length;
  const open = counts.unsure + counts.missing;
  const set = (patch: Partial<Mapping>) => (setMapping((m) => ({ ...m, ...patch })), setReview(false), setPicks(new Map()));
  const setCol = (k: "name" | "option" | "sku" | "price" | "gst", v: string) => set({ [k]: v === "" ? undefined : Number(v) });

  if (!rows) {
    return (
      <div className="adm-card sti-form sti-stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Upload a sheet</h2>
        <p className="adm-muted adm-small">An Excel or CSV file with one product per row: its name, the quantity, and ideally the price.</p>
        {err && (
          <p className="adm-err" role="alert" style={{ margin: 0 }}>
            {err}
          </p>
        )}
        <div
          className={`sti-drop ${over ? "is-over" : ""}`}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => (e.preventDefault(), setOver(false), void load(e.dataTransfer.files[0]))}
        >
          <p style={{ margin: 0 }}>Drop a file here</p>
          <button type="button" className="adm-btn pri" onClick={() => input.current?.click()}>
            Choose a file
          </button>
          <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => (void load(e.target.files?.[0]), (e.target.value = ""))} />
        </div>
        {onCancel && (
          <button type="button" className="adm-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    );
  }

  const width = Math.max(1, ...rows.slice(0, 40).map((r) => r.length));
  const head = rows[mapping.headerRow] ?? [];
  const colOpts = Array.from({ length: width }, (_, i) => (
    <option key={i} value={i}>
      {colName(i)}: {(head[i] ?? "").trim() || "(blank)"}
    </option>
  ));
  const sel = (label: string, k: "name" | "option" | "sku" | "price" | "gst", hint?: string) => (
    <label className="adm-label">
      {label}
      <select className="adm-input" value={mapping[k] ?? ""} onChange={(e) => setCol(k, e.target.value)}>
        <option value="">{hint ?? "None"}</option>
        {colOpts}
      </select>
    </label>
  );
  const preview = rows.slice(mapping.headerRow + 1, mapping.headerRow + 6);

  return (
    <div className="adm-card sti-form sti-stack">
      <div className="sti-item-head">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{review ? "Check the rows" : "Which column is which?"}</h2>
        <button type="button" className="adm-btn" onClick={() => (setRows(null), setReview(false))}>
          Another file
        </button>
      </div>
      <p className="adm-muted adm-small" style={{ margin: 0, overflowWrap: "anywhere" }}>
        {fileName} · {rows.length} row{rows.length === 1 ? "" : "s"}
      </p>

      {!review && (
        <>
          {guessed ? (
            <p className="adm-small" style={{ margin: 0 }}>
              We guessed the columns from the headings. Change any that are wrong.
            </p>
          ) : (
            <p className="adm-small sti-voidnote" style={{ margin: 0 }}>
              We couldn&apos;t find the headings. Choose the columns yourself.
            </p>
          )}
          <label className="adm-label">
            Headings are on row
            <select className="adm-input" value={mapping.headerRow} onChange={(e) => set({ headerRow: Number(e.target.value) })}>
              {rows.slice(0, 20).map((r, i) => (
                <option key={i} value={i}>
                  {i + 1}: {r.filter((c) => c.trim()).slice(0, 4).join(", ") || "(blank row)"}
                </option>
              ))}
            </select>
          </label>
          <div className="sti-grid">
            {sel("Product name", "name", "None (use SKU)")}
            {sel("Option", "option")}
            {sel("SKU", "sku")}
            <label className="adm-label">
              Quantity
              <select className="adm-input" value={mapping.qty < 0 ? "" : mapping.qty} onChange={(e) => set({ qty: e.target.value === "" ? -1 : Number(e.target.value) })}>
                <option value="">Choose a column</option>
                {colOpts}
              </select>
            </label>
            {sel("Price before GST", "price", "None (type it later)")}
            {sel("GST %", "gst", "None (use each product's GST)")}
          </div>
          {preview.length > 0 && (
            <div className="sti-table-wrap">
              <table className="sti-preview">
                <thead>
                  <tr>
                    <th>Row</th>
                    {Array.from({ length: width }, (_, i) => (
                      <th key={i}>{colName(i)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td>{mapping.headerRow + i + 2}</td>
                      {Array.from({ length: width }, (_, c) => (
                        <td key={c}>{r[c] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!mappingOk && <p className="adm-small sti-voidnote" style={{ margin: 0 }}>Choose the quantity column, and either the product name or the SKU.</p>}
          <button type="button" className="adm-btn pri" disabled={!mappingOk} onClick={() => setReview(true)}>
            Match to my products
          </button>
        </>
      )}

      {review && (
        <>
          <div className="adm-seg sti-filters" role="group" aria-label="Show rows">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? "is-on" : ""} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} {counts[f.key]}
              </button>
            ))}
          </div>
          <ul className="sti-list">
            {matches.filter((m) => effective(m).status === filter).length === 0 && <li className="adm-muted adm-small">No rows here.</li>}
            {matches
              .filter((m) => effective(m).status === filter)
              .map((m) => (
                <ReviewRow key={m.row} m={m} chosen={picks.get(m.row)} catalogue={catalogue} byId={byId} onPick={(p) => setPicks((old) => new Map(old).set(m.row, p))} onUndo={() => setPicks((old) => (old.delete(m.row), new Map(old)))} />
              ))}
          </ul>
          {open > 0 && (
            <p className="adm-small sti-voidnote" style={{ margin: 0 }}>
              {open} row{open === 1 ? " is" : "s are"} unsure or not found, and will be left out unless you pick a product.
            </p>
          )}
          {conflicts.map((c) => (
            <p key={c} className="adm-small sti-voidnote" role="alert" style={{ margin: 0 }}>
              {c}
            </p>
          ))}
          {noPrice > 0 && (
            <p className="adm-muted adm-small" style={{ margin: 0 }}>
              {noPrice} line{noPrice === 1 ? " has" : "s have"} no price in the sheet. You&apos;ll type {noPrice === 1 ? "it" : "them"} on the next screen.
            </p>
          )}
          <div className="adm-actions">
            <button type="button" className="adm-btn pri" style={{ flex: 1 }} disabled={lines.length === 0 || conflicts.length > 0} onClick={() => onLines(lines)}>
              Use {lines.length} line{lines.length === 1 ? "" : "s"}
            </button>
            <button type="button" className="adm-btn" onClick={() => setReview(false)}>
              Back
            </button>
          </div>
        </>
      )}
      {!review && onCancel && (
        <button type="button" className="adm-btn" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

function ReviewRow({
  m,
  chosen,
  catalogue,
  byId,
  onPick,
  onUndo,
}: {
  m: MatchRow;
  chosen: Pick | undefined;
  catalogue: Candidate[];
  byId: Map<string, Candidate>;
  onPick: (p: Pick) => void;
  onUndo: () => void;
}) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? catalogue.filter((c) => words.every((w) => `${c.product} ${c.option} ${c.sku ?? ""}`.toLowerCase().includes(w))).slice(0, 6) : [];
  const target = chosen && chosen !== "leave" ? chosen : m.variant_id;
  const needsPick = (m.status === "unsure" || m.status === "missing") && !chosen;
  const price = m.price !== null && m.price >= 0 ? `₹${paisa(m.price)}` : "no price";

  return (
    <li className="sti-item sti-review">
      <div className="sti-item-head">
        <b>{m.text || "(blank)"}</b>
        <span className="adm-muted adm-small">Row {m.row + 1}</span>
      </div>
      <div className="sti-item-sub">
        <span>Qty {m.qty}</span>
        <span>{price}</span>
      </div>
      {m.status === "skip" && !chosen && <small className="adm-muted">{m.qty <= 0 ? "No quantity, so nothing to add." : "Left out."}</small>}
      {chosen === "leave" && <small className="adm-muted">Left out.</small>}
      {target && chosen !== "leave" && (m.status === "matched" || chosen) && <small>{lineName(byId.get(target))}</small>}
      {needsPick && (
        <div className="sti-stack">
          {m.options.length > 0 && (
            <label className="adm-label">
              {m.status === "unsure" ? "Which one?" : "Pick one"}
              <select className="adm-input" value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
                <option value="">Choose a product</option>
                {m.options.map((id) => (
                  <option key={id} value={id}>
                    {lineName(byId.get(id))}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sti-find">
            <input className="adm-input" value={q} placeholder="Search your products" aria-label={`Search products for row ${m.row + 1}`} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
            {q.trim() !== "" && (
              <ul className="sti-hits" aria-label="Matching products">
                {hits.length === 0 && <li className="adm-muted adm-small sti-none">Nothing matches.</li>}
                {hits.map((c) => (
                  <li key={c.variant_id}>
                    <button type="button" onClick={() => onPick(c.variant_id)}>
                      <span>{lineName(c)}</span>
                      {c.sku && <small className="adm-muted">{c.sku}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="adm-btn" onClick={() => onPick("leave")}>
            Leave out
          </button>
        </div>
      )}
      {chosen && (
        <button type="button" className="adm-btn" onClick={onUndo}>
          Undo
        </button>
      )}
    </li>
  );
}
