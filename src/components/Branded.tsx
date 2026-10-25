import { brandOf } from "@/lib/brand";

// A product's name with its brand set apart above it: "RAW" then "Classic Ks".
// Read aloud, it is still the whole name.
export default function Branded({ name }: { name: string }) {
  const { brand, title } = brandOf(name);
  return (
    <>
      {brand && <span className="bb-brand">{brand} </span>}
      {title}
    </>
  );
}
