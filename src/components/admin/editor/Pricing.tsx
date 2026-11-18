"use client";

import { errText } from "@/lib/orders-db";
import { type ReactNode, useEffect, useState } from "react";
import { isAdminDemo } from "@/lib/admin-api";
import { type AdminProduct, type AdminVariant, type BoxSize } from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";
import { GST_BRACKETS, supplierGst, unitProfit } from "@/lib/gst";
import type { Purchase } from "@/lib/orders-db";
import { BoxSetup, BoxSetupProps, BoxesBlock } from "./Boxes";

// ---------------------------------------------------------------- price
//
// The price, in the order the shop thinks of it:
//   buying price (before GST) -> GST paid to the supplier -> cost price
//   (worked out) -> selling price (at the product's GST bracket) -> profit,
//   with a note of the GST behind it (collected, paid, claimed back, owed)
// With sizes or colours, one card each, the selling bracket chosen once for
// the product. Buying prices live in an admin-only table (0015, 0030, 0057, 0059);
// the database adds the GST paid to make the cost price.
export type Rules = { rate: number; inclusive: boolean; credit: boolean; cess?: number };
// GST paid to the supplier as typed: a rate (null: the selling bracket) and,
// when typed over, the amount per piece
export type SupplierGst = { rate: number | null; amount: number | null };
export const SHOWN_BRACKETS = GST_BRACKETS.filter((b) => b > 0);
export function Pricing({
  product,
  onPatch,
  onVariant,
  onDeleteVariant,
  onAdd,
  photos,
  boxes,
}: {
  product: AdminProduct;
  onPatch: (patch: { gst_rate?: number | null; cess_rate?: number }) => void;
  onVariant: (v: AdminVariant, patch: Partial<AdminVariant>) => void;
  onDeleteVariant: (v: AdminVariant) => void;
  onAdd: () => void;
  photos: (v: AdminVariant) => ReactNode;
  // the product's category is sold in boxes (0061): each loose option shows its boxes
  boxes: { setup: BoxSetupProps; onAdd: (unit: AdminVariant, size: BoxSize) => void } | null;
}) {
  // loose options get the cards; boxes sit inside the option they hold
  const variants = product.variants.filter((v) => !v.unit_variant_id);
  const boxesOf = (v: AdminVariant) => product.variants.filter((b) => b.unit_variant_id === v.id);
  // costs for boxes too (a box's cost is its pieces' x pack_of)
  const ids = product.variants.map((v) => v.id).join(",");
  // stock in moves the average buying price, so read again when a count moves
  const counts = product.variants.map((v) => `${v.stock_qty}${v.track_stock ? "t" : "u"}`).join(",");
  const [costs, setCosts] = useState<Map<string, Purchase> | null>(null);
  const [shop, setShop] = useState<(Rules & { cessOn: boolean }) | null>(null);
  const [err, setErr] = useState("");

  // again when the bracket changes: the database re-adds the GST to the cost
  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    import("@/lib/orders-db")
      .then((m) => Promise.all([m.getPurchases(list), m.getSettings()]))
      .then(([c, s]) => {
        setCosts(c);
        setShop({ rate: s.gst_rate, inclusive: s.gst_inclusive, credit: s.gst_input_credit, cessOn: s.cess_enabled });
      })
      .catch(() => {
        setCosts(new Map());
        // the demo catalogue (?demo) works without the database: sample rules
        if (isAdminDemo()) setShop({ rate: 18, inclusive: true, credit: true, cessOn: false });
      });
  }, [ids, product.gst_rate, counts]);

  const rules: Rules = { rate: product.gst_rate ?? shop?.rate ?? 18, inclusive: shop?.inclusive ?? true, credit: shop?.credit ?? false, cess: shop?.cessOn ? product.cess_rate : 0 };
  const many = variants.length > 1;

  // correcting a buying price (or setting the opening stock's), with a reason (0057)
  async function correctBuying(id: string, purchase: number, rate: number, reason: string) {
    const m = await import("@/lib/orders-db");
    await m.correctPurchase(id, purchase, rate, reason);
    const got = (await m.getPurchases([id])).get(id);
    setCosts((c) => {
      const n = new Map(c);
      if (got) n.set(id, got);
      return n;
    });
  }

  async function saveBuying(id: string, purchase: number | null, gst?: SupplierGst) {
    setErr("");
    try {
      const m = await import("@/lib/orders-db");
      const got = await m.setPurchase(id, purchase, gst);
      setCosts((c) => {
        const n = new Map(c);
        if (!got) n.delete(id);
        else n.set(id, got);
        return n;
      });
    } catch (e) {
      setErr(errText(e));
    }
  }

  const gst = (
    <div className="ape-line ape-line--gst">
      <span className="ape-line-label">
        GST on sales <small>this product&apos;s slab, charged to the buyer</small>
      </span>
      <div className="ape-chips" role="group" aria-label="GST rate">
        {SHOWN_BRACKETS.map((b) => (
          <button key={b} type="button" className={rules.rate === b ? "is-on" : ""} aria-pressed={rules.rate === b} onClick={() => product.gst_rate !== b && onPatch({ gst_rate: b })}>
            {b}%
          </button>
        ))}
      </div>
    </div>
  );
  // cess on top of GST, only once switched on in Settings (0060)
  const cessField = shop?.cessOn ? <CessField key={product.id} value={product.cess_rate} onSave={(n) => onPatch({ cess_rate: n })} /> : null;

  return (
    <section className="ape-fields ape-pricing">
      <h3>Price</h3>
      {boxes && <BoxSetup {...boxes.setup} />}
      {!costs || !shop ? (
        <p className="ape-hint">Loading…</p>
      ) : many ? (
        <>
          {gst}
          {cessField}
          <ul className="ape-cards">
            {variants.map((v) => (
              <PriceRow
                key={v.id}
                variant={v}
                card
                have={costs.get(v.id)}
                rules={rules}
                onBuying={(n, g) => saveBuying(v.id, n, g)}
                onCorrect={(n, r, why) => correctBuying(v.id, n, r, why)}
                onSave={(patch) => onVariant(v, patch)}
                onDelete={() => onDeleteVariant(v)}
                photos={photos(v)}
                boxes={boxes && <BoxesBlock unit={v} boxes={boxesOf(v)} costs={costs} rules={rules} sizes={boxes.setup.sizes} onAdd={boxes.onAdd} onSave={onVariant} onDelete={onDeleteVariant} />}
              />
            ))}
          </ul>
        </>
      ) : (
        variants[0] && <PriceRow key={variants[0].id} variant={variants[0]} have={costs.get(variants[0].id)} rules={rules} gst={<>{gst}{cessField}</>} onBuying={(n, g) => saveBuying(variants[0].id, n, g)} onCorrect={(n, r, why) => correctBuying(variants[0].id, n, r, why)} onSave={(patch) => onVariant(variants[0], patch)} boxes={boxes && <BoxesBlock unit={variants[0]} boxes={boxesOf(variants[0])} costs={costs} rules={rules} sizes={boxes.setup.sizes} onAdd={boxes.onAdd} onSave={onVariant} onDelete={onDeleteVariant} />} />
      )}
      {err && <p className="ape-err">{err}</p>}
      <button type="button" className="ape-chip" onClick={onAdd}>
        + Add a size or colour
      </button>
    </section>
  );
}
// a ₹ amount typed in place; saves when you leave it
export function Money({ value, label, placeholder, onChange, onSave }: { value: string; label: string; placeholder: string; onChange: (v: string) => void; onSave: () => void }) {
  return (
    <span className="ape-money ape-line-input">
      <i aria-hidden>₹</i>
      <input
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={onSave}
      />
    </span>
  );
}
export function PriceRow({
  variant: v,
  card = false,
  have,
  rules,
  gst,
  photos,
  boxes,
  onBuying,
  onCorrect,
  onSave,
  onDelete,
}: {
  variant: AdminVariant;
  card?: boolean;
  have: Purchase | undefined;
  rules: Rules;
  gst?: ReactNode;
  photos?: ReactNode;
  boxes?: ReactNode;
  onBuying: (purchase: number | null, gst?: SupplierGst) => void;
  onCorrect: (purchase: number, gstRate: number, reason: string) => Promise<void>;
  onSave: (patch: Partial<AdminVariant>) => void;
  onDelete?: () => void;
}) {
  // a cost typed before buying prices existed shows as its buying price
  const start = have ? (have.purchase ?? Math.round(((have.cost * 100) / (100 + rules.rate)) * 100) / 100) : null;
  const [buy, setBuy] = useState(start == null ? "" : String(start));
  const [sell, setSell] = useState(v.price ? String(v.price) : "");
  const [sellWas, setSellWas] = useState(v.price);
  if (v.price !== sellWas) {
    setSellWas(v.price);
    setSell(v.price ? String(v.price) : "");
  }
  // GST paid to the supplier, as typed: the rate (null follows the selling
  // bracket) and the amount, filled in from the rate until typed over
  // as saved: a bracket whose amount matches the GST paid shows as that rate
  // (none: the product's own); any other amount shows as typed
  const savedRate = have?.gstPaid != null && have.purchase != null ? ([0, ...SHOWN_BRACKETS].find((r) => supplierGst(have.purchase!, r) === have.gstPaid) ?? null) : null;
  const savedAmt = have?.gstPaid != null && have.purchase != null && savedRate == null ? have.gstPaid : null;
  const [gRate, setGRate] = useState<number | null>(savedRate === rules.rate ? null : savedRate);
  const [gAmt, setGAmt] = useState(savedAmt != null ? String(savedAmt) : "");
  const [label, setLabel] = useState(v.label);
  const [confirm, setConfirm] = useState(false);

  // once an option is counted, its buying price is the average kept by stock
  // in (Add stock, voids), so it is shown here, not typed; so is the GST paid
  // once supplier bills feed it
  const fromStock = v.track_stock;
  // counted stock takes its price and GST from the bills (and corrections)
  const fromBills = fromStock;
  const b = fromStock ? start : buy.trim() === "" ? null : Number(buy);
  const s = Number(sell) || 0;
  const rate = gRate ?? rules.rate;
  const typedAmt = gAmt.trim() === "" ? null : Number(gAmt);
  // counted stock: the GST paid as averaged off the bills (0057), else at the
  // product's own rate; typed: as picked or typed here
  const paid = fromBills ? (have?.gstPaid ?? (b == null ? null : supplierGst(b, rules.rate))) : b == null ? null : supplierGst(b, rate, typedAmt);
  const claimable = fromBills ? (have?.gstClaimable ?? paid) : paid;
  const billRate = have?.gstPaid != null && have.purchase ? Math.round((have.gstPaid / have.purchase) * 1000) / 10 : null;
  const cost = b == null || paid == null ? null : Math.round((b + paid) * 100) / 100;
  const u = cost != null && s > 0 ? unitProfit(s, cost, rules, { paid, claimable }) : null;
  const money = (n: number) => formatPrice(n, { paise: true });
  // the supplier GST as it now stands, saved with the purchase price
  const saveGst = (next: SupplierGst) => {
    if (b == null) return;
    setGRate(next.rate);
    setGAmt(next.amount == null ? "" : String(next.amount));
    onBuying(b, next);
  };
  // correcting the price (or setting the opening stock's)
  const [fixing, setFixing] = useState(false);
  const [fixPrice, setFixPrice] = useState("");
  const [fixRate, setFixRate] = useState("");
  const [fixWhy, setFixWhy] = useState("");
  const [fixErr, setFixErr] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  function openFix() {
    setFixPrice(start != null ? String(start) : "");
    setFixRate(String(billRate ?? rules.rate));
    setFixWhy(start == null ? "Opening stock" : "");
    setFixErr("");
    setFixing(true);
  }
  async function saveFix() {
    const n = Number(fixPrice);
    const r = Number(fixRate);
    if (!(fixPrice.trim() !== "" && n >= 0)) return setFixErr("Enter the buying price before GST.");
    if (!(fixRate.trim() !== "" && r >= 0 && r <= 100)) return setFixErr("Enter the GST rate on the bill, 0 to 100%.");
    if (fixWhy.trim().length < 3) return setFixErr("Say why, for the activity log.");
    setFixBusy(true);
    setFixErr("");
    try {
      await onCorrect(n, r, fixWhy.trim());
      setFixing(false);
    } catch (e) {
      setFixErr(errText(e));
    }
    setFixBusy(false);
  }

  return (
    <li className={card ? "ape-card" : "ape-one"}>
      {card && (
        <div className="ape-card-head">
          <input className="ape-card-name" aria-label="Size or colour name" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} onBlur={() => label.trim() && label !== v.label && onSave({ label: label.trim() })} />
          <button type="button" className={`ape-switch ape-switch--sm ${v.is_visible ? "is-on" : ""}`} aria-pressed={v.is_visible} onClick={() => onSave({ is_visible: !v.is_visible })} title={v.is_visible ? "On sale: tap to hide" : "Hidden: tap to put on sale"}>
            <i aria-hidden="true" />
            <span className="sr-only">{v.is_visible ? "On sale" : "Hidden"}</span>
          </button>
          {onDelete &&
            (confirm ? (
              <button type="button" className="ape-del is-sure" onClick={onDelete} onBlur={() => setConfirm(false)}>
                Delete?
              </button>
            ) : (
              <button type="button" className="ape-del" onClick={() => setConfirm(true)} aria-label={`Delete ${v.label}`}>
                ×
              </button>
            ))}
        </div>
      )}

      {fromStock ? (
        <>
          <div className="ape-line">
            <span className="ape-line-label">
              Purchase price (excl. GST){" "}
              <small>
                average of the stock bought in ·{" "}
                <button type="button" className="ape-linkbtn" onClick={() => (fixing ? setFixing(false) : openFix())}>
                  {start == null ? "set the opening stock's price" : "correct it"}
                </button>
              </small>
            </span>
            <b className="ape-line-value">{start != null ? formatPrice(start, { paise: true }) : "Add stock to set it"}</b>
          </div>
          {fixing && (
            <div className="ape-fix">
              <p>
                {start == null
                  ? "What the stock already on the shelf cost, before GST. Bills added later average against it."
                  : "Fix a wrong average, e.g. stock counted in by hand at the wrong price. Bills added later average against the new price; the old one and your reason stay in the activity log."}
              </p>
              <div className="ape-fix-row">
                <label>
                  <span>Price before GST</span>
                  <input inputMode="decimal" value={fixPrice} onChange={(e) => setFixPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" />
                </label>
                <label>
                  <span>GST % on the bill</span>
                  <input inputMode="decimal" value={fixRate} onChange={(e) => setFixRate(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(rules.rate)} />
                </label>
              </div>
              <label>
                <span>Why</span>
                <input value={fixWhy} maxLength={300} onChange={(e) => setFixWhy(e.target.value)} placeholder="e.g. opening count was entered at the wrong price" />
              </label>
              {fixErr && <p className="ape-err">{fixErr}</p>}
              <div className="ape-fix-actions">
                <button type="button" className="ape-chip" onClick={() => setFixing(false)}>
                  Cancel
                </button>
                <button type="button" className="ape-chip is-on" disabled={fixBusy} onClick={saveFix}>
                  {fixBusy ? "Saving" : "Save price"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <label className="ape-line">
          <span className="ape-line-label">
            Purchase price (excl. GST) <small>type it until stock is added</small>
          </span>
          <Money value={buy} label={`${v.label} purchase price, excl. GST`} placeholder="0" onChange={setBuy} onSave={() => b !== start && onBuying(b, { rate: gRate, amount: typedAmt })} />
        </label>
      )}
      {fromBills ? (
        <div className="ape-line">
          <span className="ape-line-label">
            GST paid to supplier <small>average off the supplier bills, per piece</small>
          </span>
          <b className="ape-line-value">
            {paid != null ? money(paid) : "–"}
            {paid != null && claimable != null && claimable < paid && <small className="ape-line-sub"> {money(claimable)} of it claimable</small>}
          </b>
        </div>
      ) : (
        <div className="ape-line ape-line--gst">
          <span className="ape-line-label">
            GST paid to supplier <small>pick the rate on their bill; change the amount if their bill differs</small>
          </span>
          <div className="ape-gst-paid">
            <div className="ape-chips" role="group" aria-label="GST rate the supplier charged">
              {[0, ...SHOWN_BRACKETS].map((r) => (
                <button key={r} type="button" className={rate === r ? "is-on" : ""} aria-pressed={rate === r} disabled={b == null} onClick={() => saveGst({ rate: r === rules.rate ? null : r, amount: null })}>
                  {r}%
                </button>
              ))}
            </div>
            <Money
              value={gAmt !== "" ? gAmt : paid != null ? paid.toFixed(2) : ""}
              label={`${v.label} GST paid to the supplier, per piece`}
              placeholder="0"
              onChange={setGAmt}
              onSave={() => {
                // typed back to what the rate gives: no override
                const auto = b == null ? null : supplierGst(b, rate);
                const amount = typedAmt == null || typedAmt === auto ? null : typedAmt;
                if (amount !== savedAmt || gRate !== (savedRate === rules.rate ? null : savedRate)) saveGst({ rate: gRate, amount });
                else if (amount == null) setGAmt("");
              }}
            />
            {typedAmt != null && b != null && typedAmt !== supplierGst(b, rate) && (
              <button type="button" className="ape-link" onClick={() => saveGst({ rate: gRate, amount: null })}>
                Use {rate}% ({money(supplierGst(b, rate))})
              </button>
            )}
          </div>
        </div>
      )}
      {gst}
      <div className="ape-line">
        <span className="ape-line-label">
          Cost price (incl. GST) <small>{fromBills && have?.gstPaid != null ? `purchase price + ${billRate}% GST paid on the bills` : "purchase price + GST paid to supplier"}</small>
        </span>
        <b className="ape-line-value">{cost != null ? money(cost) : "–"}</b>
      </div>
      <label className="ape-line">
        <span className="ape-line-label">
          {rules.inclusive ? "Selling price (incl. GST)" : "Selling price (excl. GST)"} <small>{rules.inclusive ? "what the customer pays" : "GST is added at checkout"}</small>
        </span>
        <Money value={sell} label={`${v.label} selling price`} placeholder="0" onChange={setSell} onSave={() => s !== v.price && onSave({ price: s })} />
      </label>
      {/* the same price the other way round: before GST, or with it (and cess) */}
      {s > 0 && (
        <p className="ape-other-price">
          {rules.inclusive
            ? `${money(u?.net ?? (s * 100) / (100 + rules.rate + (rules.cess ?? 0)))} before GST${rules.cess ? " and cess" : ""}`
            : `${money(u?.sale ?? (s * (100 + rules.rate + (rules.cess ?? 0))) / 100)} with GST${rules.cess ? " and cess" : ""}: what the customer pays`}
        </p>
      )}

      {/* the headline is what the shop keeps once the GST collected is paid over;
          gross (with that GST still in it) is shown underneath for reference */}
      <div className={`ape-profit ${u ? (u.kept < 0 ? "is-neg" : "is-pos") : ""}`}>
        {u ? (
          <>
            <span>
              <b>
                {u.kept < 0 ? "Net loss" : "Net profit"} {formatPrice(Math.abs(u.kept), { paise: true })}
              </b>{" "}
              per piece · {u.net > 0 ? ((u.kept / u.net) * 100).toFixed(1) : "0"}% margin
            </span>
            <GstNote u={u} credit={rules.credit} fromBills={fromBills} />
          </>
        ) : (
          <small>{b == null && !s ? "Type the purchase and selling price to see the profit." : b == null ? "Type the purchase price to see the profit." : "Type the selling price to see the profit."}</small>
        )}
      </div>
      {boxes}
      {photos && <div className="ape-opt-photos">{photos}</div>}
    </li>
  );
}
// The GST behind the profit, written out for one piece: what the buyer paid
// and the GST in it, what the supplier was paid and the GST in that, how much
// of it is claimed back and why, the GST left to pay over, and the profit
// with and without the claim. The same sums as admin_profit() (0059).
export function GstNote({ u, credit, fromBills }: { u: ReturnType<typeof unitProfit>; credit: boolean; fromBills: boolean }) {
  const money = (n: number) => formatPrice(n, { paise: true });
  const signed = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));
  const why = !credit
    ? "Nothing claimed back: input tax credit is off in Settings."
    : u.itc === 0
      ? fromBills
        ? "Nothing claimed back: none of the supplier bills can be claimed (no supplier GSTIN, or not in GSTR-2B)."
        : "Nothing claimed back: no GST was paid to the supplier."
      : u.itc < u.paid
        ? `Claimed back ${money(u.itc)} of the ${money(u.paid)}: only bills from suppliers with a GSTIN count.`
        : `Claimed back all ${money(u.itc)} as input tax credit.`;
  return (
    <details className="ape-gst-note">
      <summary>
        After GST · gross {money(u.profit)} before paying the GST collected · <span className="ape-link">How this is worked out</span>
      </summary>
      <dl>
        <dt>Sold for</dt>
        <dd>
          {money(u.sale)} = {money(u.net)} + <b>{money(u.collected)}</b> GST collected from the buyer
          {u.cess > 0 && <> + {money(u.cess)} cess (paid over in full)</>}
        </dd>
        <dt>Cost</dt>
        <dd>
          {money(u.cost)} = {money(u.cost - u.paid)} + <b>{money(u.paid)}</b> GST paid to the supplier
        </dd>
        <dt>Rebate</dt>
        <dd>{why}</dd>
        <dt>GST you pay</dt>
        <dd>
          {money(u.collected)} collected − {money(u.itc)} claimed back = <b>{money(u.owed)}</b> to the government
        </dd>
        <dt>Profit</dt>
        <dd>
          {money(u.net)} − {money(u.cost)} + {money(u.itc)} claimed back = <b>{signed(u.kept)}</b>
          {u.itc > 0 && <> ({signed(u.keptNoItc)} if nothing could be claimed back)</>}
        </dd>
      </dl>
    </details>
  );
}
// the cess rate, percent of the taxable value (0060)
export function CessField({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  const n = v.trim() === "" ? 0 : Number(v);
  const ok = Number.isFinite(n) && n >= 0 && n <= 400;
  return (
    <label className="ape-line">
      <span className="ape-line-label">
        Cess <small>percent on top of GST; 0 for none</small>
      </span>
      <span className="ape-money ape-line-input">
        <input inputMode="decimal" aria-label="Cess rate, percent" aria-invalid={!ok} placeholder="0" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} onBlur={() => ok && n !== value && onSave(n)} />
        <i aria-hidden>%</i>
      </span>
    </label>
  );
}
// the HSN code, printed on invoices
export function HsnField({ product, onSave }: { product: AdminProduct; onSave: (hsn: string) => void }) {
  const [hsn, setHsn] = useState(product.hsn);
  const ok = /^(\d{4}|\d{6}|\d{8})?$/.test(hsn.trim());
  return (
    <section className="ape-fields">
      <h3>HSN code</h3>
      <label className="ape-field">
        <span>Printed on invoices; 4, 6 or 8 digits</span>
        <input inputMode="numeric" maxLength={8} placeholder="e.g. 4813" value={hsn} aria-invalid={!ok} onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))} onBlur={() => ok && hsn.trim() !== product.hsn && onSave(hsn.trim())} />
      </label>
      {!ok && <p className="ape-err">An HSN code is 4, 6 or 8 digits.</p>}
    </section>
  );
}
