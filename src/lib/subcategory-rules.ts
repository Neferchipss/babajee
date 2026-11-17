// Each category's starting sub-categories (0063), in their groups, and how a
// product's name says which apply: "Showerhead Perc Glass Beaker Bong 14""
// is Glass, 14" to 16", Showerhead perc and Beaker. Built from the shop's own
// product names. Used to fill a category in one go (shown first, saved only
// when confirmed) and to suggest tags for a new product. Brands are left out:
// the shelf already filters by brand.

type Test = RegExp | ((name: string) => boolean);
export type TagRule = { tag: string; test: Test };
export type GroupRule = { group: string; tags: TagRule[] };

// the size in inches in a name: 14", 10'', 10 inch
const inches = (n: string) => {
  const m = /(\d+(?:\.\d+)?)\s*(?:"|''|inch)/i.exec(n);
  return m ? Number(m[1]) : null;
};
const between = (lo: number, hi: number) => (n: string) => {
  const i = inches(n);
  return i != null && i >= lo && i <= hi;
};

export const SUBCATEGORY_RULES: Record<string, GroupRule[]> = {
  bong: [
    { group: "Material", tags: [{ tag: "Glass", test: /glass/i }, { tag: "Acrylic", test: /acrylic/i }, { tag: "Silicone", test: /silicon/i }] },
    { group: "Size", tags: [{ tag: 'Up to 8"', test: between(0, 8) }, { tag: '9" to 12"', test: between(9, 12) }, { tag: '14" to 16"', test: between(13, 16) }, { tag: '20" and up', test: between(17, 999) }] },
    { group: "Percolator", tags: [{ tag: "Showerhead perc", test: /showerhead/i }, { tag: "Tree perc", test: /tree/i }, { tag: "Honeycomb perc", test: /honeycomb/i }, { tag: "Spoke perc", test: /spoke/i }] },
    { group: "Style", tags: [{ tag: "Beaker", test: /beaker/i }, { tag: "Bubbler", test: /bubbler/i }, { tag: "Recycler", test: /recycler/i }, { tag: "Gravity", test: /gravity/i }, { tag: "Mini", test: /\b(micro|mini)\b/i }] },
  ],
  "rolling-paper": [
    { group: "Size", tags: [{ tag: "King size", test: /\bks\b|king/i }, { tag: "Regular / single wide", test: /regular|single wide|78\s*mm/i }, { tag: "1¼", test: /1\s*1\/4|11\/4|1¼/i }, { tag: "Rolls", test: /\d\s*m\s*roll|\broll\b/i }, { tag: "Cones", test: /cone/i }] },
    { group: "Paper", tags: [{ tag: "Hemp", test: /hemp/i }, { tag: "Rice", test: /rice/i }, { tag: "Bamboo", test: /bamboo/i }, { tag: "Unbleached / brown", test: /brown|unbleached|connoisseur|artesano|raw classic/i }, { tag: "Flavoured", test: /juicy|mango|birthday|mix-n|flavou?r/i }] },
    { group: "Extras", tags: [{ tag: "With tips", test: /tips/i }, { tag: "Slim", test: /slim|thin/i }] },
  ],
  grinder: [
    { group: "Material", tags: [{ tag: "Metal", test: /metal|zinc|alloy|aluminium/i }, { tag: "Plastic", test: /plastic/i }] },
    { group: "Size", tags: [{ tag: "40mm", test: /40\s*mm/i }, { tag: "50mm", test: /50\s*mm/i }, { tag: "63mm", test: /63\s*mm/i }] },
    {
      group: "Style",
      tags: [{ tag: "Character / novelty", test: /alien|basketball|bulldog|darth|deadpool|fist|grenade|hamburger|jamaican|middle finger|pikachu|pokeball|rick|skull|star wars|thor|toothless|stro?m ?t[o]+per|missile|gear|diamond/i }],
    },
  ],
  "rolling-tray": [
    { group: "Size", tags: [{ tag: "Mini", test: /\bmini\b/i }, { tag: "Small", test: /\bsmall\b/i }, { tag: "Medium", test: /\bmedium\b/i }, { tag: "Large", test: /\bbig\b|\blarge\b/i }] },
    { group: "Material", tags: [{ tag: "Metal", test: /metal|steel/i }, { tag: "Wooden", test: /wood/i }, { tag: "Glass", test: /glass/i }, { tag: "Bamboo", test: /bamb/i }] },
    { group: "Extras", tags: [{ tag: "Magnetic / with cover", test: /magn|cover/i }] },
  ],
  "bong-accessory": [
    { group: "Joint size", tags: [{ tag: "14mm", test: /14\s*mm/i }, { tag: "18mm", test: /18\s*mm/i }] },
    {
      group: "Type",
      tags: [{ tag: "Bowls", test: /bowl/i }, { tag: "Ash catchers", test: /ash\s*catcher/i }, { tag: "Shooters", test: /shooter/i }, { tag: "Dab nails", test: /dab|quartz|quatrz/i }, { tag: "Converters", test: /conver/i }, { tag: "Downstems", test: /downstem/i }],
    },
  ],
  pipe: [
    { group: "Material", tags: [{ tag: "Glass", test: /glass/i }, { tag: "Wood", test: /wood|rose\s*wood/i }, { tag: "Ceramic", test: /ceramic/i }, { tag: "Soapstone", test: /soapstone/i }, { tag: "Meerschaum", test: /meer/i }] },
    { group: "Type", tags: [{ tag: "Chillums", test: /chill/i }, { tag: "One hitters", test: /one hitter/i }] },
  ],
  storage: [
    {
      group: "Type",
      tags: [
        { tag: "Doob tubes", test: /doob/i },
        { tag: "Jars", test: /\bjars?\b/i },
        { tag: "Tin cases", test: /\btin\b|paper case|flip case/i },
        { tag: "Stash cans", test: /\bcan\b|storage can|soda|fanta|7up|canada/i },
        { tag: "Pouches & wallets", test: /pouch|wallet|bag/i },
        { tag: "Cigarette cases", test: /cig+a?ret+e|ciggrette/i },
      ],
    },
    { group: "Extras", tags: [{ tag: "Smell proof", test: /smell|vac/i }] },
  ],
  ashtray: [
    { group: "Material", tags: [{ tag: "Glass", test: /glass/i }, { tag: "Metal", test: /metal|regal/i }, { tag: "Silicone", test: /silicone/i }, { tag: "Resin / polystone", test: /polystone|skull|alien|easter|toilet/i }] },
    { group: "Extras", tags: [{ tag: "Glow in the dark", test: /glow/i }, { tag: "Pocket", test: /pocket/i }] },
  ],
};

// the tags a product's name points to, in its category: [group, tag] pairs
export function suggestTags(categorySlug: string, name: string): { group: string; tag: string }[] {
  const rules = SUBCATEGORY_RULES[categorySlug];
  if (!rules) return [];
  return rules.flatMap((g) => g.tags.filter((t) => (typeof t.test === "function" ? t.test(name) : t.test.test(name))).map((t) => ({ group: g.group, tag: t.tag })));
}
