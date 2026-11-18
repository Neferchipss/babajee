"use client";

import { useEffect, useState } from "react";
import { type AdminProduct, type BundlePart } from "@/lib/admin-data";
import { toastError } from "@/components/admin/Toaster";
import { formatPrice } from "@/lib/currency";
import { Api } from "./ProductBasics";

// Bundle (combo pack, 0071): an option made of other products' options. Its
// stock is what the parts make, and selling one takes the parts.
export function BundleBlock({ api, product, onSaved }: { api: Api; product: AdminProduct; onSaved: () => void }) {
  const opts = product.variants.filter((v) => !v.unit_variant_id);
  const [at, setAt] = useState(opts[0]?.id ?? "");
  const [parts, setParts] = useState<BundlePart[] | null>(null);
  const [all, setAll] = useState<AdminProduct[] | null>(null);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!at) return;
    let live = true;
    api.listBundle(at).then(
      (p) => {
        if (!live) return;
        setParts(p);
        if (p.length) setOpen(true);
      },
      () => live && setParts([]),
    );
    return () => {
      live = false;
    };
  }, [api, at]);

  const self = opts.find((v) => v.id === at);
  const q = find.trim().toLowerCase();
  const hits =
    q && all
      ? all
          .filter((p) => p.id !== product.id && p.status !== "archived" && `${p.name} ${p.brand}`.toLowerCase().includes(q))
          .flatMap((p) => p.variants.filter((v) => !v.unit_variant_id && !parts?.some((x) => x.component_variant_id === v.id)).map((v) => ({ p, v })))
          .slice(0, 8)
      : [];
  const separately = (parts ?? []).reduce((n, x) => n + x.price * x.qty, 0);
  const makes = (parts ?? []).filter((x) => x.track_stock).map((x) => Math.floor(x.stock / x.qty));

  async function save(next: BundlePart[]) {
    setBusy(true);
    const before = parts;
    setParts(next);
    try {
      await api.saveBundle(at, next.map((x) => ({ component_variant_id: x.component_variant_id, qty: x.qty })));
      onSaved();
    } catch (e) {
      setParts(before);
      toastError(e);
    }
    setBusy(false);
  }

  if (!opts.length) return null;
  return (
    <section className="ape-fields ape-bundle">
      <h3>Bundle (combo pack)</h3>
      {!open ? (
        <>
          <p className="ape-hint">Sell this as a set of other products, like a starter kit. Its stock is what the parts make, and each sale takes the parts out of stock.</p>
          <button
            type="button"
            className="adm-btn"
            onClick={() => {
              setOpen(true);
              if (!all) api.listProducts().then(setAll, toastError);
            }}
          >
            Make this a bundle
          </button>
        </>
      ) : (
        <>
          {opts.length > 1 && (
            <label className="adm-small">
              Option{" "}
              <select className="adm-input col-inline" value={at} onChange={(e) => setAt(e.target.value)}>
                {opts.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {parts === null ? (
            <p className="ape-hint">Loading.</p>
          ) : (
            <>
              <ul className="ape-bundle-parts">
                {parts.map((x, i) => (
                  <li key={x.component_variant_id}>
                    <span>
                      {x.product}
                      {x.option && x.option !== "Default" && x.option !== "Standard" ? <small className="adm-muted"> · {x.option}</small> : null}
                      <small className="adm-muted"> · {formatPrice(x.price)} · {x.track_stock ? `${x.stock} in stock` : "stock not counted"}</small>
                    </span>
                    <span className="ape-bundle-qty">
                      <button type="button" aria-label={`Fewer ${x.product}`} disabled={busy || x.qty <= 1} onClick={() => save(parts.map((y, k) => (k === i ? { ...y, qty: y.qty - 1 } : y)))}>
                        −
                      </button>
                      <output>{x.qty}</output>
                      <button type="button" aria-label={`More ${x.product}`} disabled={busy || x.qty >= 100} onClick={() => save(parts.map((y, k) => (k === i ? { ...y, qty: y.qty + 1 } : y)))}>
                        +
                      </button>
                      <button type="button" aria-label={`Take ${x.product} out`} disabled={busy} onClick={() => save(parts.filter((_, k) => k !== i))}>
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="col-find">
                <input
                  className="adm-input"
                  value={find}
                  onFocus={() => !all && api.listProducts().then(setAll, toastError)}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Add a product to the bundle: type its name"
                  aria-label="Find a product to add to the bundle"
                />
                {hits.length > 0 && (
                  <ul>
                    {hits.map(({ p, v }) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setFind("");
                            void save([...parts, { component_variant_id: v.id, qty: 1, product: p.name, option: v.label, price: v.price, stock: v.stock_qty, track_stock: v.track_stock }]);
                          }}
                        >
                          {p.name}
                          {v.label !== "Default" && v.label !== "Standard" ? <small className="adm-muted"> · {v.label}</small> : null}
                          <small className="adm-muted"> · {formatPrice(v.price)}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {parts.length > 0 && (
                <p className="ape-hint">
                  Bought separately: <b>{formatPrice(separately)}</b>
                  {self && self.price > 0 && separately > 0 && (
                    <>
                      {" "}
                      · bundle price {formatPrice(self.price)}
                      {separately > self.price ? ` · saves the customer ${formatPrice(separately - self.price)} (${Math.round(((separately - self.price) / separately) * 100)}%)` : " · no saving: check the price"}
                    </>
                  )}
                  {" · "}
                  {makes.length ? `${Math.min(...makes)} can be made from stock now` : "no part counts stock"}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
