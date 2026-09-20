// A grouped product is stored under its first option's full name
// ("Ring Joint Holder - Silver"). Show the base name as the title and the
// tail as the first option.
export function splitVariantName(name: string) {
  const m =
    name.match(/^(.*?)\s*[-–]\s*([^-–]+)$/) ?? name.match(/^(.*?)\s*\(([^)]+)\)$/);
  return m ? { base: m[1].trim(), label: m[2].trim() } : { base: name, label: "Standard" };
}

export function displayName(product: { name: string; variants: unknown[] }) {
  return product.variants.length > 0 ? splitVariantName(product.name).base : product.name;
}
