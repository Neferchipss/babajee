// A shelf's tag filters (Size, Paper, Extras … from Catalogue > Categories),
// shown in the Sort & filter panel: one row per group, each tag with how
// many products it would leave. Within a row any chosen tag will do (King
// size or Rolls); across rows each row must match (King size AND Hemp). A
// row's counts follow the other rows' choices, not its own.

type Tag = { slug: string; name: string; group: string };
type Tagged = { tags?: string[] };

export type FacetRow = { group: string; tags: { slug: string; name: string; n: number; on: boolean }[] };

export function buildFacets<P extends Tagged>(tags: Tag[], products: P[], chosen: string[]): { rows: FacetRow[]; matching: P[]; count: number } {
  const used = tags.filter((t) => products.some((p) => p.tags?.includes(t.slug)));
  const groups = [...new Set(used.map((t) => t.group))].map((g) => ({ group: g, tags: used.filter((t) => t.group === g) }));
  const passes = (p: P, skip?: string) =>
    groups.every((r) => {
      if (r.group === skip) return true;
      const on = r.tags.filter((t) => chosen.includes(t.slug));
      return !on.length || on.some((t) => p.tags?.includes(t.slug));
    });
  const rows = groups.map((r) => {
    const base = products.filter((p) => passes(p, r.group));
    return { group: r.group, tags: r.tags.map((t) => ({ slug: t.slug, name: t.name, n: base.filter((p) => p.tags?.includes(t.slug)).length, on: chosen.includes(t.slug) })) };
  });
  return { rows, matching: products.filter((p) => passes(p)), count: used.filter((t) => chosen.includes(t.slug)).length };
}
