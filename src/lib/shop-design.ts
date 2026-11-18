// The shop design on <html data-design> (src/app/themes/shop-designs.css).
// The boot script puts the last one seen there before the first paint; the
// live one (Admin > Storefront) replaces it once read. Never in the admin.
export const DESIGN_KEY = "bj-design";

export const designBootScript = `var d=new URLSearchParams(location.search).get("design")||localStorage.getItem(${JSON.stringify(DESIGN_KEY)});if(d&&d!=="current"&&/^[a-z]+$/.test(d)&&location.pathname.indexOf("/admin")<0)document.documentElement.dataset.design=d;`;

// show a design on every shop page; keep it for the next visit unless it's
// only being looked at (?design=)
export function applyShopDesign(d: string | null | undefined, keep = true) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preview = new URLSearchParams(location.search).get("design");
  const show = preview ?? d;
  if (location.pathname.includes("/admin") || !show || show === "current") delete root.dataset.design;
  else root.dataset.design = show;
  if (keep && d) {
    try {
      localStorage.setItem(DESIGN_KEY, d);
    } catch {}
  }
}
