import { useId } from "react";

// One icon per category slug, drawn from public/icons/categories/<slug>.png
// (sliced from a generated sheet by tools/icons/slice.py). Each PNG is black
// on transparent and used as an alpha mask over currentColor, so the icon
// takes the theme's text colour exactly like the old line icons did. It is
// still an <svg>, so every existing `.x svg { width; color }` rule applies.
const KNOWN = new Set([
  "all",
  "rolling-paper",
  "accessory",
  "rolling-tray",
  "storage",
  "bong",
  "bong-accessory",
  "ashtray",
  "pipe",
  "grinder",
  "filter",
  "rolling-tobacco",
  "roach",
  "cigars",
  "lighter",
  "blunt-wraps",
  "cleaning-accessory",
  "blunt-pre-rolled-cone",
  "keychain",
  "lighter-refills",
]);

export default function CategoryIcon({ slug, size = 24 }: { slug: string; size?: number }) {
  const id = useId();
  if (!KNOWN.has(slug)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="7" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <mask id={id} style={{ maskType: "alpha" }}>
        <image href={`/icons/categories/${slug}.png`} x="1" y="1" width="22" height="22" />
      </mask>
      <rect width="24" height="24" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
