import { isAdminDemo, type adminApi } from "@/lib/admin-api";
import type { AdminCategory } from "@/lib/admin-data";
import { errText } from "@/lib/orders-db";
import { TEMPLATE_HEADER, type ImportPlan } from "@/lib/product-import";
import { slugify } from "@/lib/slug";

// Applying an import plan (lib/product-import.ts) and the template sheet,
// shared by both designs of Products > Import: updates first, then new options
// on products already in the shop, then new products (as drafts). Each row is
// its own step, so one bad row doesn't stop the rest.
type Api = ReturnType<typeof adminApi>;
export type ImportResult = { ok: number; failed: { what: string; why: string }[] };

export async function runImport(api: Api, plan: ImportPlan, progress: (done: number, of: number) => void): Promise<ImportResult> {
  const demo = isAdminDemo();
  const stockDb = demo ? null : await import("@/lib/stock-in/db");
  const ordersDb = demo ? null : await import("@/lib/orders-db");
  const steps: { what: string; run: () => Promise<void> }[] = [];
  const stockAndCost = async (variantId: string, stock: number | null, purchase: number | null) => {
    if (stock != null && stockDb) await stockDb.correctStock(variantId, stock, "Sheet import");
    if (purchase != null && ordersDb) await ordersDb.correctPurchase(variantId, purchase, null, "Sheet import");
  };

  for (const u of plan.updates)
    steps.push({
      what: `${u.name}${u.option !== "Default" ? ` · ${u.option}` : ""} (row ${u.row})`,
      run: async () => {
        if (Object.keys(u.product).length) await api.updateProduct(u.productId, u.product);
        if (Object.keys(u.variant).length) await api.upsertVariant(u.productId, { id: u.variantId, ...u.variant });
        await stockAndCost(u.variantId, u.stock, u.purchase);
      },
    });
  for (const o of plan.newOptions)
    steps.push({
      what: `${o.name} · ${o.option || "new option"} (row ${o.row})`,
      run: async () => {
        await api.upsertVariant(o.productId, { ...o.variant, label: o.variant.label || "Option" });
        const fresh = await api.getProduct(o.productId);
        const made = fresh?.variants.find((v) => v.label === (o.variant.label || "Option"));
        if (made) await stockAndCost(made.id, o.stock, o.purchase);
      },
    });
  for (const n of plan.newProducts)
    steps.push({
      what: `${n.name} (new, row${n.rows.length > 1 ? "s" : ""} ${n.rows.join(", ")})`,
      run: async () => {
        let id = "";
        for (let k = 1; !id; k++) {
          try {
            id = await api.createProduct({ category_id: n.categoryId, slug: k === 1 ? slugify(n.name) : `${slugify(n.name)}-${k}`, name: n.name.trim(), description: n.product.description ?? "" });
          } catch (x) {
            if ((x as { code?: string }).code !== "23505" || k > 20) throw x;
          }
        }
        await api.updateProduct(id, { status: "draft", ...n.product });
        const made = await api.getProduct(id);
        const first = made?.variants[0];
        for (const [i, o] of n.options.entries()) {
          if (i === 0 && first) {
            await api.upsertVariant(id, { id: first.id, label: o.label, sort_order: 0, ...o.variant });
            await stockAndCost(first.id, o.stock, o.purchase);
          } else {
            await api.upsertVariant(id, { label: o.label, sort_order: i, ...o.variant });
            const again = await api.getProduct(id);
            const v = again?.variants.find((x) => x.label === o.label);
            if (v) await stockAndCost(v.id, o.stock, o.purchase);
          }
        }
      },
    });

  progress(0, steps.length);
  const failed: ImportResult["failed"] = [];
  let ok = 0;
  for (const [i, s] of steps.entries()) {
    try {
      await s.run();
      ok++;
    } catch (e) {
      failed.push({ what: s.what, why: errText(e) });
    }
    progress(i + 1, steps.length);
  }
  return { ok, failed };
}

// the template: the header row and one example row, as a .csv download
export function downloadTemplate(cats: AdminCategory[]) {
  const example = ["RAW Classic King Size", cats[0]?.name ?? "Rolling Papers", "", "120", "", "40", "RAW-KS", "", "RAW", "4813", "18", "85", "20", "raw, king size", ""];
  const csv = "﻿" + [TEMPLATE_HEADER, example].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "babajee-products-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
