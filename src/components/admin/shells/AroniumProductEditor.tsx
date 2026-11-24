"use client";

// Aronium's slide-in product editor, copied tab for tab (Details | Price & tax
// | Stock control | Comments | Image & color, light title, → close, Save and
// Cancel at the bottom right), filled from Babajee's product. Babajee's own
// parts follow as extension tabs in the same style: Options, Photos (one
// group per option), Boxes & bundles, Sub-categories & tags, Shop page and
// Stock history.
//
// Like the full product page, the words and numbers are a draft saved
// together by Save (name, codes, prices, buying prices, tax, counting, the
// shop page...); photos, boxes and bundles act at once, as things done.
// Aronium fields Babajee doesn't keep are shown in place, disabled, with a
// tooltip saying why.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/admin/ui";
import { toast, toastError } from "@/components/admin/Toaster";
import { AddPhotos, PhotoGroup } from "@/components/admin/editor/Photos";
import { BoxSetup, BoxesBlock } from "@/components/admin/editor/Boxes";
import { BundleBlock } from "@/components/admin/editor/Bundle";
import { SHOWN_BRACKETS, type Rules } from "@/components/admin/editor/Pricing";
import { StockHistory, TYPE_HINTS } from "@/components/admin/editor/Details";
import { useBoxes, usePhotoManager } from "@/components/admin/editor/useProductParts";
import type { Api } from "@/components/admin/editor/ProductBasics";
import { isAdminDemo } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant, Spec, SubGroup, Subcategory } from "@/lib/admin-data";
import { BRAND_NAMES, brandOf } from "@/lib/brand";
import { GST_BRACKETS, supplierGst } from "@/lib/gst";
import { errText, type Purchase } from "@/lib/orders-db";
import { autoDescription, autoTitle, DESC_MAX, fullTitle, TITLE_MAX } from "@/lib/seo";
import { ArSwitch } from "./aronium-kit";
import { ArInfo } from "./aronium-help";
import "./aronium-screens-a.css";

const AR_TABS = ["Details", "Price & tax", "Stock control", "Comments", "Image & color"] as const;
type Tab = (typeof AR_TABS)[number] | "Options" | "Photos" | "Boxes & bundles" | "Sub-categories & tags" | "Shop page" | "Stock history";

type Opt = {
  key: string;
  id?: string;
  label: string;
  price: string;
  compare_at: string;
  sku: string;
  barcode: string;
  weight_g: string;
  is_visible: boolean;
  // buying price before GST, and the GST paid to the supplier:
  // "" the product's slab, "0".."40" a slab, "amt" the exact amount in gAmt
  buy: string;
  gst: string;
  gAmt: string;
  remove?: boolean;
};
type Draft = {
  name: string;
  description: string;
  brand: string;
  product_type: string;
  category_id: string;
  subcategory_ids: string[];
  tags: string[];
  active: boolean;
  service: boolean;
  gst_rate: number | null;
  hsn: string;
  cess_rate: string;
  low_stock_at: string;
  specs: Spec[];
  seo_title: string;
  seo_description: string;
  videos: string;
  options: Opt[];
};
type Shop = Rules & { cessOn: boolean; lowAt: number };

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const r2 = (n: number) => Math.round(n * 100) / 100;
const digits = (s: string) => s.replace(/[^\d.]/g, "");
const HSN_OK = /^(\d{4}|\d{6}|\d{8})$/;

function optOf(v: AdminVariant, have: Purchase | undefined, rate: number): Opt {
  const buy = have ? (have.purchase ?? r2((have.cost * 100) / (100 + rate))) : null;
  // as saved: a slab whose amount matches the GST paid shows as that slab
  let gst = "";
  let gAmt = "";
  if (have?.gstPaid != null && have.purchase != null) {
    const r = [0, ...SHOWN_BRACKETS].find((b) => supplierGst(have.purchase!, b) === have.gstPaid);
    if (r == null) {
      gst = "amt";
      gAmt = String(have.gstPaid);
    } else if (r !== rate) gst = String(r);
  }
  return {
    key: v.id,
    id: v.id,
    label: v.label,
    price: v.price ? String(v.price) : "",
    compare_at: str(v.compare_at),
    sku: v.sku ?? "",
    barcode: v.barcode ?? "",
    weight_g: str(v.weight_g),
    is_visible: v.is_visible,
    buy: str(buy),
    gst,
    gAmt,
  };
}
const loose = (p: AdminProduct) => p.variants.filter((v) => !v.unit_variant_id);
function draftOf(p: AdminProduct, costs: Map<string, Purchase>, shop: Shop): Draft {
  const rate = p.gst_rate ?? shop.rate;
  return {
    name: p.name,
    description: p.description,
    brand: p.brand,
    product_type: p.product_type ?? "",
    category_id: p.category_id,
    subcategory_ids: [...p.subcategory_ids].sort(),
    tags: p.tags,
    active: p.status === "published",
    service: loose(p).length > 0 && loose(p).every((v) => !v.track_stock),
    gst_rate: p.gst_rate,
    hsn: p.hsn,
    cess_rate: p.cess_rate ? String(p.cess_rate) : "",
    low_stock_at: str(p.low_stock_at),
    specs: p.specs,
    seo_title: p.seo_title,
    seo_description: p.seo_description,
    videos: p.video_urls.join("\n"),
    options: loose(p).map((v) => optOf(v, costs.get(v.id), rate)),
  };
}
// a barcode for the shop's own use: EAN-13 in the 200-299 in-store range, with its check digit
function inStoreBarcode() {
  const body = `2${String(Date.now()).slice(-11)}`;
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

const NOT_KEPT = {
  unit: "Babajee sells by the piece or by the box (see Boxes & bundles), so a product has no unit of measurement.",
  defQty: "There's no till here: online orders start at one, so there's no default quantity to switch.",
  age: "Babajee checks age for the whole shop at checkout (date of birth), not product by product.",
  change: "Prices change only here, never at checkout, so there's nothing to allow.",
  inclusive: "Whether prices include GST is set once for the whole shop, in Settings › Tax.",
  supplier: "Babajee keeps the supplier on each purchase bill (Inventory › Stock in), not on the product.",
  preferred: "Babajee doesn't suggest order quantities; it warns at the reorder point.",
  warning: "Babajee always warns once stock reaches the reorder point above; there's no separate switch.",
  comments: "Babajee prints no kitchen tickets, so products have no comments; the description is on Details.",
  color: "Product tiles take their look from the photo; there's no tile colour to pick.",
  clear: "Photos are removed one by one with the × on each, below.",
  many: "This product has options; each one has its own code and barcode, on the Options tab.",
};

// a product not saved yet, for New product: one "Default" option, Active on,
// in the group picked in the tree, its code the next number (as Aronium)
export function blankProduct(categoryId: string, code: string): AdminProduct {
  return {
    id: "",
    slug: "",
    name: "",
    description: "",
    brand: "",
    product_type: "",
    tags: [],
    seo_title: "",
    seo_description: "",
    gst_rate: null,
    subcategory_ids: [],
    video_urls: [],
    cess_rate: 0,
    hsn: "",
    is_visible: true,
    status: "published",
    subcategory: "",
    specs: [],
    low_stock_at: null,
    sort_order: 0,
    category_id: categoryId,
    variants: [
      { id: "", label: "Default", price: 0, stock_qty: 0, track_stock: true, is_visible: true, sort_order: 0, sku: code || null, barcode: null, compare_at: null, pack_of: 1, unit_variant_id: null, weight_g: null, length_cm: null, width_cm: null, height_cm: null } as AdminVariant,
    ],
    images: [],
  };
}

type Props = {
  product: AdminProduct;
  categories: AdminCategory[];
  api: Api;
  // the product after a change, re-read from the database
  onChanged: (p: AdminProduct) => void;
  onClose: () => void;
  nav?: { at: number; of: number; prev?: () => void; next?: () => void };
  // the whole catalogue: an HSN code already in use suggests its slab
  catalogue?: AdminProduct[];
  // New product: Save makes it (name, group -> its id), then saves the rest
  // into it; done opens it as an ordinary product
  create?: { make: (name: string, categoryId: string) => Promise<string>; done: (id: string) => void };
};

export default function AroniumProductEditor(props: Props) {
  return props.create ? <NewEditor {...props} create={props.create} /> : <EditEditor {...props} />;
}

// the shop's tax rules and the options' buying prices, read once per product
function useCosts(product: AdminProduct) {
  const [costs, setCosts] = useState<Map<string, Purchase> | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const ids = product.variants.map((v) => v.id).filter(Boolean).join(",");
  useEffect(() => {
    let live = true;
    import("@/lib/orders-db")
      .then((m) => Promise.all([m.getPurchases(ids ? ids.split(",") : []), m.getSettings()]))
      .then(
        ([c, s]) => {
          if (!live) return;
          setCosts(c);
          setShop({ rate: s.gst_rate, inclusive: s.gst_inclusive, credit: s.gst_input_credit, cessOn: s.cess_enabled, lowAt: s.low_stock_at });
        },
        () => {
          if (!live) return;
          setCosts(new Map());
          setShop({ rate: 18, inclusive: true, credit: false, cessOn: false, lowAt: 3 });
        },
      );
    return () => {
      live = false;
    };
  }, [ids, product]);
  return { costs, shop };
}

function Waiting({ title, product, nav, onClose, tab, setTab }: { title: string; product: AdminProduct; nav?: Props["nav"]; onClose: () => void; tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <Frame title={title} nav={nav} product={product} onClose={onClose} tab={tab} onTab={setTab} tabs={[...AR_TABS]}>
      <p className="arpx-wait" role="status">
        Loading…
      </p>
    </Frame>
  );
}

function EditEditor({ product, categories, api, onChanged, onClose, nav, catalogue = [] }: Props) {
  const [tab, setTab] = useState<Tab>("Details");
  const { costs, shop } = useCosts(product);
  // things done at once (photos, boxes, bundle): then the product is read again
  const reload = useCallback(async () => {
    const fresh = await api.getProduct(product.id);
    if (fresh) onChanged(fresh);
  }, [api, product.id, onChanged]);
  const run = useCallback(
    async (work: () => Promise<unknown>) => {
      try {
        await work();
        await reload();
        return true;
      } catch (e) {
        toastError(errText(e));
        return false;
      }
    },
    [reload],
  );
  const photos = usePhotoManager(product, api, run, (n) => toast(`${n} photo${n === 1 ? "" : "s"} added to ${product.name}`));
  const boxes = useBoxes(product, categories, api, run);
  if (!costs || !shop) return <Waiting title={product.name} {...{ product, nav, onClose, tab, setTab }} />;
  return <Body key={product.id} {...{ product, categories, api, onClose, nav, catalogue, tab, setTab, costs, shop, run, reload, photos, boxes }} />;
}

// New product: only Aronium's five tabs (photos, boxes and the rest need the
// product to exist); nothing touches the database until Save
function NewEditor({ product: blank, categories, api, onClose, catalogue = [], create }: Props & { create: NonNullable<Props["create"]> }) {
  // the blank as first given: the parent makes a new one every render
  const [product] = useState(blank);
  const [tab, setTab] = useState<Tab>("Details");
  const { costs, shop } = useCosts(product);
  const reload = useCallback(async () => {}, []);
  const run = useCallback(async () => false, []);
  if (!costs || !shop) return <Waiting title="New product" {...{ product, onClose, tab, setTab }} />;
  return <Body {...{ product, categories, api, onClose, catalogue, tab, setTab, costs, shop, run, reload, photos: null, boxes: null, create }} />;
}

type Parts = {
  product: AdminProduct;
  categories: AdminCategory[];
  api: Api;
  onClose: () => void;
  nav?: { at: number; of: number; prev?: () => void; next?: () => void };
  catalogue: AdminProduct[];
  tab: Tab;
  setTab: (t: Tab) => void;
  costs: Map<string, Purchase>;
  shop: Shop;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  reload: () => Promise<void>;
  photos: ReturnType<typeof usePhotoManager> | null;
  boxes: ReturnType<typeof useBoxes> | null;
  create?: Props["create"];
};

function Body({ product, categories, api, onClose, nav, catalogue, tab, setTab, costs, shop, run, reload, photos, boxes, create }: Parts) {
  const saved = useMemo(() => draftOf(product, costs, shop), [product, costs, shop]);
  const [d, setD] = useState<Draft>(saved);
  const [base, setBase] = useState<Draft>(saved);
  if (base !== saved && JSON.stringify(base) !== JSON.stringify(saved)) {
    setBase(saved);
    setD(saved);
  }
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setOpt = (key: string, patch: Partial<Opt>) => setD((x) => ({ ...x, options: x.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) }));
  const [busy, setBusy] = useState(false);
  const [taxing, setTaxing] = useState(false);
  const live = d.options.filter((o) => !o.remove);
  const many = live.length > 1;
  const [optKey, setOptKey] = useState(live[0]?.key ?? "");
  const cur = live.find((o) => o.key === optKey) ?? live[0];
  const rate = d.gst_rate ?? shop.rate;
  const rules: Rules = { rate, inclusive: shop.inclusive, credit: shop.credit, cess: shop.cessOn ? Number(d.cess_rate) || 0 : 0 };
  const fileInput = useRef<HTMLInputElement>(null);

  // Alt + arrows step through the products (not with changes unsaved)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dirty || !e.altKey) return;
      if (e.key === "ArrowRight") nav?.next?.();
      if (e.key === "ArrowLeft") nav?.prev?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function check(): string {
    if (!d.name.trim()) return "The product needs a name.";
    if (!live.length) return "Keep at least one option.";
    for (const o of live) {
      if (!o.label.trim()) return "Every option needs a name.";
      const p = num(o.price);
      const c = num(o.compare_at);
      if (p != null && !(p >= 0)) return `${o.label}: the sale price isn't a number.`;
      if (c != null && p != null && c <= p) return `${o.label}: the was-price should be above the sale price.`;
      if (o.buy && !(Number(o.buy) >= 0)) return `${o.label}: the cost isn't a number.`;
      if (o.weight_g && !(Number(o.weight_g) > 0)) return `${o.label}: the weight should be in grams.`;
    }
    if (d.hsn && !HSN_OK.test(d.hsn)) return "An HSN code is 4, 6 or 8 digits.";
    if (d.cess_rate && !(Number(d.cess_rate) >= 0)) return "Cess is a percentage.";
    const urls = d.videos.split(/\s+/).filter(Boolean);
    if (urls.some((u) => !/^https:\/\/\S+$/.test(u))) return "Each video link starts with https://.";
    if (urls.length > 6) return "Six videos at most.";
    return "";
  }

  async function save() {
    const problem = check();
    if (problem) {
      toastError(problem);
      return;
    }
    setBusy(true);
    try {
      // New product: made first (name and group, as the old dialog), then
      // everything else is saved into it like any edit
      let target = product;
      let was0 = base;
      let draft = d;
      if (create) {
        const id = await create.make(d.name.trim(), d.category_id);
        const made = await api.getProduct(id);
        if (!made) throw new Error("The new product was made but couldn't be read back. Refresh the list.");
        target = made;
        was0 = draftOf(made, new Map(), shop);
        // the draft's one option is the new product's "Default"
        const v0 = loose(made)[0];
        draft = { ...d, options: d.options.map((o, i) => (i === 0 && !o.id && v0 ? { ...o, key: v0.id, id: v0.id } : o)) };
      }
      const same = (k: keyof Draft) => JSON.stringify(draft[k]) === JSON.stringify(was0[k]);
      const patch: Parameters<Api["updateProduct"]>[1] = {};
      if (!same("name")) patch.name = draft.name.trim();
      if (!same("description")) patch.description = draft.description.trim();
      if (!same("brand")) patch.brand = draft.brand.trim();
      if (!same("product_type")) patch.product_type = draft.product_type.trim();
      if (!same("category_id")) patch.category_id = draft.category_id;
      if (!same("tags")) patch.tags = draft.tags;
      if (!same("gst_rate")) patch.gst_rate = draft.gst_rate;
      if (!same("hsn")) patch.hsn = draft.hsn;
      if (!same("cess_rate")) patch.cess_rate = Number(draft.cess_rate) || 0;
      if (!same("low_stock_at")) patch.low_stock_at = draft.low_stock_at === "" ? null : Math.min(10000, Number(draft.low_stock_at));
      if (!same("specs")) patch.specs = draft.specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() })).filter((s) => s.label && s.value);
      if (!same("seo_title")) patch.seo_title = draft.seo_title.trim();
      if (!same("seo_description")) patch.seo_description = draft.seo_description.trim();
      if (!same("videos")) patch.video_urls = draft.videos.split(/\s+/).filter(Boolean);
      if (Object.keys(patch).length) await api.updateProduct(target.id, patch);

      const m = await import("@/lib/orders-db");
      const buying = (o: Opt) => [num(o.buy), { rate: o.gst === "" || o.gst === "amt" ? null : Number(o.gst), amount: o.gst === "amt" ? num(o.gAmt) : null }] as const;
      const fresh: Opt[] = [];
      for (const o of draft.options) {
        const was = was0.options.find((b) => b.key === o.key);
        if (o.remove) {
          if (o.id) await api.deleteVariant(o.id);
          continue;
        }
        const row: Partial<AdminVariant> = {
          label: o.label.trim(),
          price: num(o.price) ?? 0,
          compare_at: num(o.compare_at),
          sku: o.sku.trim() || null,
          barcode: o.barcode.trim() || null,
          weight_g: num(o.weight_g),
          is_visible: o.is_visible,
        };
        if (!o.id) {
          await api.upsertVariant(target.id, { ...row, sort_order: target.variants.length + draft.options.indexOf(o) });
          if (o.buy) fresh.push(o);
          continue;
        }
        const { buy: _b, gst: _g, gAmt: _a, ...words } = o;
        const { buy: _wb, gst: _wg, gAmt: _wa, ...wasWords } = was ?? o;
        void [_b, _g, _a, _wb, _wg, _wa];
        if (JSON.stringify(words) !== JSON.stringify(wasWords)) await api.upsertVariant(target.id, { id: o.id, ...row });
        if (was && (o.buy !== was.buy || o.gst !== was.gst || o.gAmt !== was.gAmt)) await m.setPurchase(o.id, ...buying(o));
      }
      // a new option's cost: found again by its name once it exists
      if (fresh.length) {
        const after = await api.getProduct(target.id);
        for (const o of fresh) {
          const v = after?.variants.find((x) => !target.variants.some((y) => y.id === x.id) && x.label === o.label.trim());
          if (v) await m.setPurchase(v.id, ...buying(o));
        }
      }
      // Service (not using stock): counting off for every loose option, or back on
      if (!same("service")) {
        const st = await import("@/lib/stock-in/db");
        const now = (await api.getProduct(target.id)) ?? target;
        for (const v of loose(now)) if (v.track_stock === draft.service) await st.setCounting(v.id, !draft.service, "Product editor: Service (not using stock)");
      }
      // sub-categories belong to the type: a new type starts with none
      if (!same("subcategory_ids") || !same("category_id")) await api.setProductSubcategories(target.id, draft.subcategory_ids);
      if (!same("active")) {
        const now = (await api.getProduct(target.id)) ?? target;
        await api.setProductStatus(now, draft.active ? "published" : target.status === "archived" ? "archived" : "draft");
      }
      if (create) {
        toast(`${draft.name.trim()} added${draft.active ? "" : " as a draft"}`);
        create.done(target.id);
        return;
      }
      await reload();
      toast(`${draft.name.trim()} saved`);
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }

  const cat = categories.find((c) => c.id === d.category_id);
  const tabs: Tab[] = !photos || !boxes ? [...AR_TABS] : [...AR_TABS, "Options", ...(photos.many ? (["Photos"] as Tab[]) : []), "Boxes & bundles", "Sub-categories & tags", "Shop page", "Stock history"];
  const shown = tabs.includes(tab) ? tab : "Details";
  const stockLink = `/admin/inventory/stock?product=${product.id}${isAdminDemo() ? "&demo=1" : ""}`;

  return (
    <Frame
      title={create ? "New product" : d.name.trim() || product.name}
      nav={nav}
      product={product}
      onClose={onClose}
      tab={shown}
      onTab={setTab}
      tabs={tabs}
      dirty={dirty}
      footer={
        <>
          <button type="button" className="ara-panel-btn" disabled={!dirty || busy} onClick={() => void save()}>
            <span aria-hidden="true">✓</span> {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="ara-panel-btn" onClick={onClose}>
            <span aria-hidden="true">✕</span> Cancel
          </button>
        </>
      }
    >
      {shown === "Details" && (
        <div className="arpx-tab">
          <Fld label="Name" w="mid" invalid={!d.name.trim()}>
            <input className="adm-input" value={d.name} maxLength={160} aria-invalid={!d.name.trim()} onChange={(e) => set({ name: e.target.value })} />
          </Fld>
          <Fld label="Code" w="short" title={many ? NOT_KEPT.many : "The SKU"}>
            <input className="adm-input" value={many ? "" : (cur?.sku ?? "")} disabled={many} maxLength={60} onChange={(e) => cur && setOpt(cur.key, { sku: e.target.value })} />
          </Fld>
          <Fld label="Barcode" w="wide" title={many ? NOT_KEPT.many : undefined}>
            <input className="adm-input" value={many ? "" : (cur?.barcode ?? "")} disabled={many} maxLength={60} onChange={(e) => cur && setOpt(cur.key, { barcode: e.target.value })} />
          </Fld>
          <button type="button" className="arpx-link" disabled={many || !cur} title={many ? NOT_KEPT.many : "An in-store EAN-13 (starts with 2)"} onClick={() => cur && setOpt(cur.key, { barcode: inStoreBarcode() })}>
            Generate barcode
          </button>
          <Fld label="Unit of measurement" w="short" title={NOT_KEPT.unit}>
            <input className="adm-input" disabled value="" />
          </Fld>
          <Fld label="Group" w="mid">
            <select className="adm-input" value={d.category_id} onChange={(e) => set({ category_id: e.target.value, subcategory_ids: [] })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Fld>
          <div className="arpx-toggles">
            <ArSwitch on={d.active} label="Active" title={d.active ? "On the shop" : product.status === "archived" ? "Archived: off the shop, kept for its orders" : "Draft: not on the shop yet"} onChange={(v) => set({ active: v })} />
            <ArSwitch on disabled label="Default quantity" title={NOT_KEPT.defQty} />
            <ArSwitch on={d.service} label="Service (not using stock)" title="On: stock isn't counted for this product" onChange={(v) => set({ service: v })} />
          </div>
          <Fld label="Age restriction" w="short" title={NOT_KEPT.age} after={<span className="arpx-unit">year(s)</span>}>
            <input className="adm-input" disabled value="" />
          </Fld>
          <Fld label="Description" w="full">
            <textarea className="adm-input arpx-desc" value={d.description} placeholder="Pack size, material, what it fits" onChange={(e) => set({ description: e.target.value })} />
          </Fld>
        </div>
      )}

      {shown === "Price & tax" && (
        <div className="arpx-tab">
          {many && (
            <Fld label="Option" w="mid" title="Babajee: each option has its own cost and price">
              <select className="adm-input" value={cur?.key} onChange={(e) => setOptKey(e.target.value)}>
                {live.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label || "New option"}
                  </option>
                ))}
              </select>
            </Fld>
          )}
          <div className="arpx-fld">
            <span>Taxes</span>
            {(d.gst_rate != null || d.hsn) && (
              <ul className="arpx-taxes">
                <li>
                  <b>GST {rate}%</b>
                  {d.gst_rate == null && <small> (shop default)</small>}
                  <span>HSN {d.hsn || "—"}</span>
                  {shop.cessOn && Number(d.cess_rate) > 0 && <span>Cess {d.cess_rate}%</span>}
                </li>
              </ul>
            )}
            <div className="arpx-row">
              <button type="button" className="arpx-btn" onClick={() => setTaxing(true)}>
                {d.hsn || d.gst_rate != null ? "Change tax" : "Add tax to product"}
              </button>
              <span className="arpx-q" title="A product's GST slab follows its HSN code: pick the HSN code first, then its slab. Without one, the shop's default slab applies." aria-label="Help">
                ?
              </span>
            </div>
          </div>
          {cur && (
            <PriceFields
              key={cur.key}
              o={cur}
              rate={rate}
              onChange={(p) => setOpt(cur.key, p)}
            />
          )}
          <div className="arpx-toggles">
            <ArSwitch on={shop.inclusive} disabled label="Price includes tax" title={NOT_KEPT.inclusive} />
            <ArSwitch on={false} disabled label="Price change allowed" title={NOT_KEPT.change} />
          </div>
        </div>
      )}

      {shown === "Stock control" && (
        <div className="arpx-tab">
          <ArInfo>
            Set low stock quantity rules that can be used as a stock reorder point.{" "}
            <Link href={stockLink}>Learn more</Link>
          </ArInfo>
          <Fld label="Supplier" w="supplier" title={NOT_KEPT.supplier}>
            <select className="adm-input" disabled value="">
              <option value="">(none)</option>
            </select>
          </Fld>
          <Fld label="Reorder point" w="qty" title={`Warn when stock reaches this. Empty: the shop's ${shop.lowAt}`}>
            <input className="adm-input is-num" inputMode="numeric" placeholder={String(shop.lowAt)} value={d.low_stock_at} disabled={d.service} onChange={(e) => set({ low_stock_at: e.target.value.replace(/\D/g, "") })} />
          </Fld>
          <Fld label="Preferred quantity" w="qty" title={NOT_KEPT.preferred}>
            <input className="adm-input is-num" disabled value="0" />
          </Fld>
          <div className="arpx-toggles">
            <ArSwitch on={!d.service} disabled label="Low stock warning" title={NOT_KEPT.warning} />
          </div>
          <Fld label="Low stock warning quantity" w="qty" title={NOT_KEPT.warning} dim>
            <input className="adm-input is-num" disabled value={d.service ? "0" : d.low_stock_at || String(shop.lowAt)} />
          </Fld>
          <button type="button" className="arpx-link" disabled={d.low_stock_at === ""} title={`Back to the shop's ${shop.lowAt}`} onClick={() => set({ low_stock_at: "" })}>
            Reset to default
          </button>
        </div>
      )}

      {shown === "Comments" && (
        <div className="arpx-tab arpx-fill">
          <ArInfo>
            Comments will be printed on kitchen tickets. <span title={NOT_KEPT.comments}>Learn more</span>
          </ArInfo>
          <div className="arpx-row" title={NOT_KEPT.comments}>
            <input className="adm-input arpx-comment" disabled placeholder="Enter comment..." />
            <button type="button" className="arpx-tool" disabled>
              <span aria-hidden="true">+</span> Add
            </button>
            <button type="button" className="arpx-tool" disabled>
              <span aria-hidden="true">🗑</span> Delete
            </button>
          </div>
          <div className="arpx-list" title={NOT_KEPT.comments} />
        </div>
      )}

      {shown === "Image & color" && (
        <div className="arpx-tab">
          <Fld label="Color" w="mid" title={NOT_KEPT.color}>
            <select className="adm-input arpx-color" disabled value="t">
              <option value="t">Transparent</option>
            </select>
          </Fld>
          <div className="arpx-fld">
            <span>Image</span>
            <div className="arpx-row">
              <button type="button" className="arpx-btn is-big" disabled={!photos || !!photos.uploading} title={photos ? undefined : "Save the product first, then add its photos"} onClick={() => fileInput.current?.click()}>
                {photos?.uploading ? `Uploading ${Math.min(photos.uploading.done + 1, photos.uploading.of)} of ${photos.uploading.of}` : "Browse"}
              </button>
              <button type="button" className="arpx-btn is-big" disabled title={NOT_KEPT.clear}>
                Clear
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void photos?.addFiles([...(e.target.files ?? [])], null);
                e.target.value = "";
              }}
            />
          </div>
          {photos && (
          <div className="arpx-photos">
            <PhotoGroup {...photos.groupProps} group={null} items={photos.itemsOf(null)} onFiles={(f) => photos.addFiles(f, null)} add={null} />
            <small>Drag to reorder; the first is the product&apos;s main photo. You can also paste a photo.</small>
          </div>
          )}
        </div>
      )}

      {shown === "Options" && (
        <div className="arpx-tab">
          <div className="arpx-opts" role="table" aria-label="Options">
            <div className="arpx-opt is-head" role="row">
              <span>Option</span>
              <span>Sale price</span>
              <span>Was</span>
              <span>Cost</span>
              <span>Code</span>
              <span>Barcode</span>
              <span>Weight (g)</span>
              <span>Stock</span>
              <span>Visible</span>
              <span />
            </div>
            {d.options.map((o) => {
              const v = product.variants.find((x) => x.id === o.id);
              if (o.remove)
                return (
                  <div key={o.key} className="arpx-opt is-gone" role="row">
                    <span>
                      {o.label || "New option"} is removed on Save.{" "}
                      <button type="button" className="arpx-link" onClick={() => setOpt(o.key, { remove: false })}>
                        Undo
                      </button>
                    </span>
                  </div>
                );
              return (
                <div key={o.key} className="arpx-opt" role="row">
                  <input className="adm-input" aria-label="Option name" placeholder="e.g. Red, 14 inch" value={o.label} maxLength={80} onChange={(e) => setOpt(o.key, { label: e.target.value })} />
                  <input className="adm-input is-num" aria-label={`${o.label} sale price`} inputMode="decimal" placeholder="0" value={o.price} onChange={(e) => setOpt(o.key, { price: digits(e.target.value) })} />
                  <input className="adm-input is-num" aria-label={`${o.label} was-price`} inputMode="decimal" placeholder="—" value={o.compare_at} onChange={(e) => setOpt(o.key, { compare_at: digits(e.target.value) })} />
                  <input className="adm-input is-num" aria-label={`${o.label} cost`} inputMode="decimal" placeholder="—" value={o.buy} onChange={(e) => setOpt(o.key, { buy: digits(e.target.value) })} />
                  <input className="adm-input" aria-label={`${o.label} code`} value={o.sku} maxLength={60} onChange={(e) => setOpt(o.key, { sku: e.target.value })} />
                  <input className="adm-input" aria-label={`${o.label} barcode`} value={o.barcode} maxLength={60} onChange={(e) => setOpt(o.key, { barcode: e.target.value })} />
                  <input className="adm-input is-num" aria-label={`${o.label} weight in grams`} inputMode="decimal" value={o.weight_g} onChange={(e) => setOpt(o.key, { weight_g: digits(e.target.value) })} />
                  <span className="arpx-stock">{!v ? "New" : v.track_stock ? v.stock_qty : "Not counted"}</span>
                  <ArSwitch on={o.is_visible} label="" title={o.is_visible ? "On sale" : "Hidden"} onChange={(x) => setOpt(o.key, { is_visible: x })} />
                  <button
                    type="button"
                    className="arpx-x"
                    aria-label={`Remove ${o.label || "this option"}`}
                    disabled={live.length < 2}
                    title={live.length < 2 ? "A product keeps at least one option" : "Remove on Save"}
                    onClick={() => (o.id ? setOpt(o.key, { remove: true }) : set({ options: d.options.filter((x) => x.key !== o.key) }))}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <div className="arpx-row">
            <button
              type="button"
              className="arpx-tool"
              onClick={() =>
                set({
                  options: [...d.options, { key: `new-${Date.now()}`, label: "", price: live[0]?.price ?? "", compare_at: "", sku: "", barcode: "", weight_g: live[0]?.weight_g ?? "", is_visible: true, buy: "", gst: "", gAmt: "" }],
                })
              }
            >
              <span aria-hidden="true">+</span> Add option
            </button>
            <Link className="arpx-tool" href={stockLink}>
              Add or adjust stock in Inventory
            </Link>
          </div>
          <small className="arpx-note">Sizes, colours or packs of this product, each with its own price, codes and stock. Cost is the buying price before GST; the GST paid on it is on Price & tax.</small>
        </div>
      )}

      {shown === "Photos" && photos && (
        <div className="arpx-tab arpx-photos">
          {loose(product).map((v) => (
            <div key={v.id} className="arpx-optphotos">
              <b>{v.label}</b>
              <PhotoGroup
                {...photos.groupProps}
                small
                group={v.id}
                items={photos.itemsOf(v.id)}
                onFiles={(f) => photos.addFiles(f, v.id)}
                add={<AddPhotos label={photos.itemsOf(v.id).length ? "More" : `Photos of ${v.label}`} busy={!!photos.uploading} onFiles={(f) => photos.addFiles(f, v.id)} />}
              />
            </div>
          ))}
          <small>The product&apos;s own photos are on Image &amp; color. Drag a photo onto an option to move it there.</small>
        </div>
      )}

      {shown === "Boxes & bundles" && boxes && (
        <div className="arpx-tab arpx-embed">
          {boxes.boxMode ? (
            <>
              <BoxSetup {...boxes.setup} />
              {loose(product).map((v) => (
                <div key={v.id} className="arpx-optphotos">
                  {many && <b>{v.label}</b>}
                  <BoxesBlock unit={v} boxes={product.variants.filter((b) => b.unit_variant_id === v.id)} costs={costs} rules={rules} sizes={boxes.setup.sizes} onAdd={boxes.addBox} onSave={(b, patch) => run(() => api.upsertVariant(product.id, { ...b, ...patch }))} onDelete={(b) => run(() => api.deleteVariant(b.id))} />
                </div>
              ))}
            </>
          ) : (
            <small className="arpx-note">{cat?.name ?? "This group"} isn&apos;t sold in boxes. Switch it on for the group in Categories to sell this product by the box.</small>
          )}
          <BundleBlock api={api} product={product} onSaved={() => void reload()} />
        </div>
      )}

      {shown === "Sub-categories & tags" && <Organise api={api} d={d} set={set} catName={cat?.name ?? ""} />}

      {shown === "Shop page" && (
        <div className="arpx-tab">
          <Fld label="Brand" w="mid">
            <input className="adm-input" list="arpx-brands" value={d.brand} placeholder={brandOf(d.name).brand ?? "No brand"} onChange={(e) => set({ brand: e.target.value })} />
          </Fld>
          <datalist id="arpx-brands">
            {BRAND_NAMES.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <Fld label="Product type" w="mid">
            <input className="adm-input" list="arpx-types" value={d.product_type} maxLength={60} onChange={(e) => set({ product_type: e.target.value })} />
          </Fld>
          <datalist id="arpx-types">
            {TYPE_HINTS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <SeoFields d={d} set={set} slug={product.slug} catName={cat?.name ?? ""} catSlug={cat?.slug ?? ""} />
          <div className="arpx-fld">
            <span>Specifications</span>
            {d.specs.map((s, i) => (
              <div key={i} className="arpx-spec">
                <input className="adm-input" placeholder="e.g. Material" aria-label="What" value={s.label} maxLength={60} onChange={(e) => set({ specs: d.specs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                <input className="adm-input" placeholder="e.g. Aluminium" aria-label="Value" value={s.value} maxLength={200} onChange={(e) => set({ specs: d.specs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
                <button type="button" className="arpx-x" aria-label="Remove this row" onClick={() => set({ specs: d.specs.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </div>
            ))}
            <div className="arpx-row">
              <button type="button" className="arpx-tool" onClick={() => set({ specs: [...d.specs, { label: "", value: "" }] })}>
                <span aria-hidden="true">+</span> Add a row
              </button>
            </div>
          </div>
          <Fld label="Videos" w="full" hint="Links, one a line: YouTube, or a direct .mp4. Up to six.">
            <textarea className="adm-input" rows={3} spellCheck={false} placeholder="https://www.youtube.com/watch?v=…" value={d.videos} onChange={(e) => set({ videos: e.target.value })} />
          </Fld>
        </div>
      )}

      {shown === "Stock history" && (
        <div className="arpx-tab arpx-embed">
          <ul className="arpx-stocklist">
            {loose(product).map((v) => (
              <li key={v.id}>
                <span>{many ? v.label : "In stock"}</span>
                <b>{v.track_stock ? v.stock_qty : "Not counted"}</b>
              </li>
            ))}
          </ul>
          <div className="arpx-row">
            <Link className="arpx-tool" href={stockLink}>
              Add or adjust stock in Inventory
            </Link>
          </div>
          <StockHistory variants={product.variants} />
        </div>
      )}

      {taxing && <TaxPicker d={d} shop={shop} product={product} catalogue={catalogue} onClose={() => setTaxing(false)} onPick={(p) => set(p)} />}
    </Frame>
  );
}

// The panel: title and → close, the tabs on their blue rule, the body, then
// Save / Cancel; Babajee's ‹ n of N › and Open full page beside the title.
function Frame({
  title,
  nav,
  product,
  onClose,
  tab,
  onTab,
  tabs,
  dirty,
  footer,
  children,
}: {
  title: string;
  nav?: Parts["nav"];
  product: AdminProduct;
  onClose: () => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  tabs: Tab[];
  dirty?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Esc closes, unless it's closing the tax picker over the panel
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("dialog[open]") && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const hold = dirty ? "Save or cancel the changes first" : undefined;
  return (
    <div className="ara-panel arpx" role="dialog" aria-label={`Edit ${product.name}`}>
      <header>
        <h2>{title}</h2>
        <div className="arpx-head">
          {nav && (
            <span className="arpx-nav">
              <button type="button" onClick={nav.prev} disabled={!nav.prev || dirty} aria-label="Previous product" title={hold ?? "Previous (Alt + ←)"}>
                ‹
              </button>
              <span>
                {nav.at} of {nav.of}
              </span>
              <button type="button" onClick={nav.next} disabled={!nav.next || dirty} aria-label="Next product" title={hold ?? "Next (Alt + →)"}>
                ›
              </button>
            </span>
          )}
          <Link className="arpx-full" href={`/admin/products/edit?id=${product.id}${isAdminDemo() ? "&demo=1" : ""}`}>
            Open full page
          </Link>
          <button type="button" className="ara-panel-x" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <svg viewBox="0 0 20 20" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10h14M11 4l6 6-6 6" />
            </svg>
          </button>
        </div>
      </header>
      <div className="ara-ptabs arpx-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} className={`${t === tab ? "is-on" : ""} ${(AR_TABS as readonly string[]).includes(t) ? "" : "is-ext"}`} onClick={() => onTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="ara-panel-body">{children}</div>
      <footer>
        {footer ?? (
          <button type="button" className="ara-panel-btn" onClick={onClose}>
            <span aria-hidden="true">✕</span> Cancel
          </button>
        )}
      </footer>
    </div>
  );
}

// A label above its field, at Aronium's width for it; a disabled field says why in its tooltip.
function Fld({
  label,
  w,
  title,
  invalid,
  dim,
  hint,
  after,
  children,
}: {
  label: string;
  w: "short" | "qty" | "mid" | "supplier" | "wide" | "full";
  title?: string;
  invalid?: boolean;
  dim?: boolean;
  hint?: string;
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className={`arpx-fld is-${w} ${invalid ? "is-invalid" : ""} ${dim ? "is-dim" : ""}`} title={title}>
      <span>{label}</span>
      <span className="arpx-ctl">
        {children}
        {after}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

// Cost, Markup and Sale price of one option, tied as in Aronium: a markup
// sets the sale price from the cost. Plus Babajee's GST paid on the cost.
function PriceFields({ o, rate, onChange }: { o: Opt; rate: number; onChange: (p: Partial<Opt>) => void }) {
  const [mk, setMk] = useState<string | null>(null);
  const cost = Number(o.buy) || 0;
  const price = Number(o.price) || 0;
  const markup = cost > 0 && price > 0 ? String(r2((price / cost - 1) * 100)) : "0";
  return (
    <>
      <Fld label="Cost" w="short" title="The buying price, before GST">
        <input className="adm-input is-num" inputMode="decimal" placeholder="0" value={o.buy} onChange={(e) => onChange({ buy: digits(e.target.value) })} />
      </Fld>
      <Fld label="GST paid on the cost" w="mid" title="Babajee: the GST on the supplier's bill, for the cost price and input credit">
        <span className="arpx-row">
          <select className="adm-input" value={o.gst} disabled={!o.buy} onChange={(e) => onChange({ gst: e.target.value })}>
            <option value="">Same as the sale slab ({rate}%)</option>
            {GST_BRACKETS.map((b) => (
              <option key={b} value={String(b)}>
                {b}%
              </option>
            ))}
            <option value="amt">An exact amount…</option>
          </select>
          {o.gst === "amt" && <input className="adm-input is-num arpx-amt" inputMode="decimal" aria-label="GST paid per piece" placeholder="₹ per piece" value={o.gAmt} onChange={(e) => onChange({ gAmt: digits(e.target.value) })} />}
        </span>
      </Fld>
      <Fld label="Markup" w="short" after={<span className="arpx-unit">%</span>}>
        <input
          className="adm-input is-num"
          inputMode="decimal"
          value={mk ?? markup}
          disabled={!cost}
          title={cost ? undefined : "Enter the cost first"}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.-]/g, "");
            setMk(v);
            if (v !== "" && Number.isFinite(Number(v))) onChange({ price: String(r2(cost * (1 + Number(v) / 100))) });
          }}
          onBlur={() => setMk(null)}
        />
      </Fld>
      <Fld label="Sale price" w="short">
        <input className="adm-input is-num" inputMode="decimal" placeholder="0" value={o.price} onChange={(e) => onChange({ price: digits(e.target.value) })} />
      </Fld>
    </>
  );
}

// "Add tax to product": the HSN code first, and the slab that goes with it
// (a code already used in the catalogue brings its slab); cess when it's on.
function TaxPicker({ d, shop, product, catalogue, onClose, onPick }: { d: Draft; shop: Shop; product: AdminProduct; catalogue: AdminProduct[]; onClose: () => void; onPick: (p: Partial<Draft>) => void }) {
  const [hsn, setHsn] = useState(d.hsn);
  const [rate, setRate] = useState<number | null>(d.gst_rate);
  const [cess, setCess] = useState(d.cess_rate);
  const ok = HSN_OK.test(hsn);
  // the slab other products with this code are on, the most common first
  const known = useMemo(() => {
    const n = new Map<number, number>();
    for (const p of catalogue) if (p.id !== product.id && p.hsn === hsn && p.gst_rate != null) n.set(p.gst_rate, (n.get(p.gst_rate) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [catalogue, product.id, hsn]);
  return (
    <Dialog open onClose={onClose}>
      <form
        className="ara-dlg arpx-tax"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok && hsn !== "") return;
          onPick({ hsn, gst_rate: hsn ? rate : null, cess_rate: cess });
          onClose();
        }}
      >
        <h2>Product tax</h2>
        <label className="arpx-fld is-short">
          <span>HSN code</span>
          <input
            className="adm-input"
            inputMode="numeric"
            maxLength={8}
            autoFocus
            placeholder="4, 6 or 8 digits"
            value={hsn}
            aria-invalid={hsn !== "" && !ok}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              setHsn(v);
              const hit = catalogue.filter((p) => p.id !== product.id && p.hsn === v && p.gst_rate != null);
              if (HSN_OK.test(v) && hit.length) setRate(hit[0].gst_rate);
            }}
          />
          {hsn !== "" && !ok && <small className="arpx-bad">An HSN code is 4, 6 or 8 digits.</small>}
        </label>
        <label className="arpx-fld is-mid" title={ok ? undefined : "Enter the HSN code first: the slab follows it"}>
          <span>GST slab</span>
          <select className="adm-input" value={rate == null ? "" : String(rate)} disabled={!ok} onChange={(e) => setRate(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Shop default ({shop.rate}%)</option>
            {GST_BRACKETS.map((b) => (
              <option key={b} value={String(b)}>
                {b}%
              </option>
            ))}
          </select>
          {ok && known && (
            <small>
              {known[1]} other product{known[1] === 1 ? "" : "s"} with HSN {hsn} {known[1] === 1 ? "is" : "are"} on {known[0]}%.
            </small>
          )}
        </label>
        {shop.cessOn && (
          <label className="arpx-fld is-short">
            <span>Cess (%)</span>
            <input className="adm-input is-num" inputMode="decimal" placeholder="0" value={cess} onChange={(e) => setCess(digits(e.target.value))} />
          </label>
        )}
        <div className="ara-btns">
          {(d.hsn || d.gst_rate != null) && (
            <button
              type="button"
              className="adm-btn"
              onClick={() => {
                onPick({ hsn: "", gst_rate: null });
                onClose();
              }}
            >
              Remove tax
            </button>
          )}
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn pri" disabled={hsn !== "" && !ok}>
            OK
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// The type's sub-categories, ticked, and the search keywords.
function Organise({ api, d, set, catName }: { api: Api; d: Draft; set: (p: Partial<Draft>) => void; catName: string }) {
  const [list, setList] = useState<{ cat: string; groups: SubGroup[]; tags: Subcategory[] } | null>(null);
  const [kw, setKw] = useState("");
  useEffect(() => {
    let live = true;
    api.listSubcategories(d.category_id).then(
      (l) => live && setList({ cat: d.category_id, ...l }),
      () => live && setList({ cat: d.category_id, groups: [], tags: [] }),
    );
    return () => {
      live = false;
    };
  }, [api, d.category_id]);
  const tags = list?.cat === d.category_id ? list.tags : [];
  const groups = list?.cat === d.category_id ? list.groups : [];
  const rows = [...groups.map((g) => ({ g: g.name, tags: tags.filter((t) => t.group_id === g.id) })), { g: "Other", tags: tags.filter((t) => !t.group_id) }].filter((r) => r.tags.length);
  const flip = (id: string) => set({ subcategory_ids: (d.subcategory_ids.includes(id) ? d.subcategory_ids.filter((x) => x !== id) : [...d.subcategory_ids, id]).sort() });
  return (
    <div className="arpx-tab">
      <div className="arpx-fld">
        <span>Sub-categories of {catName || "this group"}</span>
        {!list ? (
          <small>Loading…</small>
        ) : rows.length ? (
          rows.map((r) => (
            <fieldset key={r.g} className="arpx-subs">
              <legend>{r.g}</legend>
              {r.tags.map((t) => (
                <label key={t.id} className="arpx-tick">
                  <input type="checkbox" checked={d.subcategory_ids.includes(t.id)} onChange={() => flip(t.id)} />
                  {t.name}
                </label>
              ))}
            </fieldset>
          ))
        ) : (
          <small>This group has no sub-categories yet.</small>
        )}
        <Link className="arpx-link" href={`/admin/products/categories?id=${d.category_id}`}>
          Manage sub-categories
        </Link>
      </div>
      <div className="arpx-fld is-full">
        <span>Search keywords</span>
        <div className="arpx-kws">
          {d.tags.map((t) => (
            <span key={t} className="arpx-kw">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => set({ tags: d.tags.filter((x) => x !== t) })}>
                ×
              </button>
            </span>
          ))}
          <input
            value={kw}
            placeholder="Type and press Enter"
            aria-label="Add a search keyword"
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== ",") return;
              e.preventDefault();
              const t = kw.trim().toLowerCase();
              if (t && !d.tags.includes(t)) set({ tags: [...d.tags, t] });
              setKw("");
            }}
          />
        </div>
        <small>Extra words people might search for. Not shown on the shop.</small>
      </div>
    </div>
  );
}

// The search listing: Google's preview, then the page title and description.
function SeoFields({ d, set, slug, catName, catSlug }: { d: Draft; set: (p: Partial<Draft>) => void; slug: string; catName: string; catSlug: string }) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "") || "your shop";
  const autoT = autoTitle({ name: d.name, category: catName });
  const autoD = autoDescription({ name: d.name, description: d.description, category: catName });
  return (
    <>
      <div className="arpx-serp">
        <small>
          {site} › shop › {catSlug} › {slug}
        </small>
        <b>{fullTitle(d.seo_title.trim() || autoT)}</b>
        <span>{d.seo_description.trim() || autoD}</span>
      </div>
      <Fld label={`Page title (${d.seo_title.length}/${TITLE_MAX})`} w="wide">
        <input className="adm-input" value={d.seo_title} maxLength={TITLE_MAX} placeholder={autoT} onChange={(e) => set({ seo_title: e.target.value })} />
      </Fld>
      <Fld label={`Page description (${d.seo_description.length}/${DESC_MAX})`} w="full" hint="Empty: made from the name, brand and description.">
        <textarea className="adm-input" rows={3} value={d.seo_description} maxLength={DESC_MAX} placeholder={autoD} onChange={(e) => set({ seo_description: e.target.value })} />
      </Fld>
    </>
  );
}
