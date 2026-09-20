import Logo from "@/components/Logo";
import Page from "@/components/Page";
import ProductArt from "@/components/ProductArt";
import { CATEGORIES } from "@/lib/catalog-data";
import { toneAt } from "@/lib/tone";
import { css, luminance, over, ratio, type RGB } from "./contrast";
import s from "./styles.module.css";

// Temporary page for choosing a UI style. Delete this folder once decided.
// Contrast is measured, not eyeballed: each panel is checked against the
// brightest glow that can sit behind it, which is its worst case.

const CHAR: RGB = [10, 10, 10];
const TEXT: RGB = [244, 242, 237];
const RED: RGB = [253, 22, 24];
const GOLD: RGB = [253, 238, 3];
const GREEN: RGB = [4, 203, 98];
const BLACK: RGB = [10, 10, 10];

type Orb = { c: RGB; a: number };

const AURORA_ORBS: Orb[] = [
  { c: RED, a: 0.6 },
  { c: GOLD, a: 0.5 },
  { c: GREEN, a: 0.55 },
];
const LIT_ORBS: Orb[] = [
  { c: RED, a: 0.32 },
  { c: GOLD, a: 0.22 },
  { c: GREEN, a: 0.3 },
];

const brightest = (orbs: Orb[]) =>
  orbs.map((o) => over(o.c, o.a, CHAR)).sort((p, q) => luminance(q) - luminance(p))[0] ?? CHAR;

function panelCheck(panel: RGB, alpha: number, backdrop: RGB, muted: RGB) {
  const bg = over(panel, alpha, backdrop);
  return { body: ratio(TEXT, bg), secondary: ratio(muted, bg) };
}

const MUTED_SITE: RGB = [143, 141, 135];
const MUTED_ON_GLASS: RGB = [201, 199, 193];
const MUTED_ON_LIT: RGB = [190, 188, 182];
const AURORA_FILL: RGB = [12, 12, 12];
const LIT_FILL: RGB = [16, 16, 16];

const blocksWorst = Math.min(...[RED, GOLD, GREEN].map((t) => ratio(BLACK, t)));

const orbVars = (orbs: Orb[]) =>
  ({
    "--orb-red": css(orbs[0].c, orbs[0].a),
    "--orb-gold": css(orbs[1].c, orbs[1].a),
    "--orb-green": css(orbs[2].c, orbs[2].a),
  }) as React.CSSProperties;

const OPTIONS = [
  {
    id: "aurora",
    title: "Aurora glass",
    verdict:
      "Dark glass over red, yellow and green light that drifts slowly. The most alive of the five.",
    facts: [
      ["Panel", "Black at 50%, 18px blur"],
      ["Edge", "1px white at 18%"],
      ["Motion", "11 to 13 second drift, off for reduced motion"],
    ],
    check: panelCheck(AURORA_FILL, 0.5, brightest(AURORA_ORBS), MUTED_ON_GLASS),
    vars: {
      "--fill": css(AURORA_FILL, 0.5),
      "--muted": css(MUTED_ON_GLASS),
      ...orbVars(AURORA_ORBS),
    } as React.CSSProperties,
  },
  {
    id: "hairline",
    title: "Gradient hairlines",
    verdict:
      "Solid dark panels edged with the flag gradient. Quiet, fast, and the easiest to apply everywhere.",
    facts: [
      ["Panel", "Solid #111, no blur"],
      ["Edge", "1px red, yellow, green gradient"],
      ["Hover", "Soft yellow glow"],
    ],
    check: panelCheck([17, 17, 17], 1, CHAR, MUTED_SITE),
    vars: { "--muted": css(MUTED_SITE) } as React.CSSProperties,
  },
  {
    id: "blocks",
    title: "Colour blocks",
    verdict:
      "A bento layout of big flat tiles with black type. The boldest Rasta statement, so it needs restraint.",
    facts: [
      ["Layout", "One large tile, two small"],
      ["Type", "Full black on solid colour"],
      ["Corners", "6px, deliberately sharp"],
    ],
    check: { body: blocksWorst, secondary: blocksWorst },
    vars: { "--muted": css(MUTED_SITE) } as React.CSSProperties,
  },
  {
    id: "neon",
    title: "Neon on black",
    verdict:
      "Glowing outlines like the shop sign. Striking in small doses, tiring across a whole shop.",
    facts: [
      ["Outline", "1.5px in the tile's colour, with glow"],
      ["Text glow", "8px, on names only"],
      ["Panel", "Transparent over black"],
    ],
    check: panelCheck(CHAR, 0, CHAR, MUTED_SITE),
    vars: { "--muted": css(MUTED_SITE) } as React.CSSProperties,
  },
  {
    id: "lit",
    title: "Lit glass",
    recommended: true,
    verdict:
      "Glass panels with a gradient edge and a faint, still light behind them. Colour stays at the edges and in the glow.",
    facts: [
      ["Panel", "Black at 62%, 16px blur"],
      ["Edge", "1px red, yellow, green gradient"],
      ["Light", "Faint and static, no animation"],
    ],
    check: panelCheck(LIT_FILL, 0.62, brightest(LIT_ORBS), MUTED_ON_LIT),
    vars: {
      "--fill": css(LIT_FILL, 0.62),
      "--muted": css(MUTED_ON_LIT),
      ...orbVars(LIT_ORBS),
    } as React.CSSProperties,
  },
];

const MATRIX = [
  ["Aurora glass", "Drifting light behind the glass", "Low rated, but blur on many panels still costs on cheap phones", "Conditional: contrast measured, motion must stop for reduced-motion", "Age gate, landing, category tiles", "Motion. Keep it to one screen."],
  ["Gradient hairlines", "The flag gradient on 1px edges", "Low, no blur", "Low risk", "The whole shop, forms, cart", "Busy if every element gets an edge"],
  ["Colour blocks", "Large flat tiles", "Low", "Low risk with full-black type", "Landing tiles, promotions", "Garish past a few tiles per screen"],
  ["Neon on black", "Glowing outlines", "Low", "Low risk with minimal glow", "Small accents like a sign or badge", "Cheap-looking across a whole shop"],
  ["Lit glass", "Faint light behind glass, gradient edges", "Low to moderate, blur on tiles and header only", "Conditional: contrast measured and passing", "Site chrome and category tiles", "Blur cost. Limit it to a few surfaces."],
];

const tiles = CATEGORIES.slice(0, 3);
const products = CATEGORIES[0].products.slice(0, 4);

const BADGES = [
  { label: "Confirmed", tone: "var(--color-rasta-green)", text: "var(--color-green-soft)" },
  { label: "Payment submitted", tone: "var(--color-rasta-gold)", text: "var(--color-rasta-gold)" },
  { label: "Out of stock", tone: "var(--color-rasta-red)", text: "var(--color-red-soft)" },
];

function Demo({ id }: { id: string }) {
  const glass = id === "aurora" || id === "lit";
  return (
    <>
      {glass && (
        <div className={s.orbs} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}

      <div className={s.hero}>
        <Logo className="w-44" />
        <p className={s.heroLine}>Papers, trays, glass and more.</p>
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.primary}`}>
            Enter the shop
          </button>
          <button type="button" className={`${s.btn} ${s.ghost}`}>
            Browse categories
          </button>
        </div>
      </div>

      <div className={s.tiles}>
        {tiles.map((c, i) => (
          <div key={c.slug} className={s.tile} style={{ "--tone": toneAt(i) } as React.CSSProperties}>
            <span className={s.count}>{c.products.length} products</span>
            <span className={s.name}>{c.name}</span>
          </div>
        ))}
      </div>

      <div className={s.products}>
        {products.map((p, i) => (
          <div key={p.slug} className={s.card} style={{ "--tone": toneAt(i) } as React.CSSProperties}>
            <ProductArt name={p.name} tone={toneAt(i)} />
            <div className={s.cardName}>{p.name}</div>
            <div className={s.price}>Rs.xx.xx</div>
          </div>
        ))}
      </div>

      <div className={s.strip}>
        <input className={s.input} placeholder="Search rolling paper" aria-label="Search rolling paper" />
        <div className={s.chips} role="group" aria-label="Option">
          <button type="button" aria-pressed="true" className={`${s.chip} ${s.chipOn}`}>
            Silver
          </button>
          <button type="button" aria-pressed="false" className={s.chip}>
            Gold
          </button>
        </div>
        <div className={s.stepper}>
          <button type="button" aria-label="Decrease quantity">
            &minus;
          </button>
          <span>1</span>
          <button type="button" aria-label="Increase quantity">
            +
          </button>
        </div>
        <div className={s.badges}>
          {BADGES.map((b) => (
            <span
              key={b.label}
              className={s.badge}
              style={{ "--tone": b.tone, "--tone-text": b.text } as React.CSSProperties}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

const PASS = 4.5;

function Ratio({ label, value }: { label: string; value: number }) {
  const ok = value >= PASS;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">
        {value.toFixed(1)}:1{" "}
        <span className={ok ? "text-green-soft" : "text-red-soft"}>{ok ? "Pass" : "Fails 4.5:1"}</span>
      </dd>
    </div>
  );
}

export default function StylesPage() {
  return (
    <Page
      title="Style options"
      lede="Every option shows the same content: a hero, category tiles, products, and the form controls and status badges the shop needs. Contrast is measured at each panel's worst spot, the brightest glow behind it."
    >
      <div className="mb-16 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <caption className="sr-only">Comparison of the five style options</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              {["Style", "Where the colour comes from", "Performance", "Accessibility", "Best for", "Watch out"].map(
                (h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr key={row[0]} className="border-b border-line last:border-0 align-top">
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={cell} scope="row" className="px-4 py-3 font-medium">
                      {cell}
                    </th>
                  ) : (
                    <td key={cell} className="px-4 py-3 text-muted">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-24">
        {OPTIONS.map((o, i) => (
          <section
            key={o.id}
            id={o.id}
            aria-labelledby={`${o.id}-h`}
            className="grid scroll-mt-28 gap-8 lg:grid-cols-[15rem_1fr]"
          >
            <div className="self-start lg:sticky lg:top-28">
              <h2 id={`${o.id}-h`} className="text-2xl">
                {i + 1}. {o.title}
              </h2>
              {"recommended" in o && (
                <p className="mt-2 inline-block rounded-md bg-rasta-gold px-2 py-0.5 text-xs font-medium text-ink">
                  My pick
                </p>
              )}
              <p className="mt-3 text-muted">{o.verdict}</p>
              <dl className="mt-6 space-y-3 text-sm">
                {o.facts.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
                <Ratio label="Body text" value={o.check.body} />
                <Ratio label="Secondary text" value={o.check.secondary} />
              </dl>
            </div>

            <div className={`${s.stage} ${s[o.id]}`} style={o.vars}>
              <Demo id={o.id} />
            </div>
          </section>
        ))}
      </div>

      <p className="mt-16 max-w-[70ch] text-sm text-muted">
        Product images stay on opaque plates in every option so photos look accurate. Ratings for
        aurora, colour blocks, neon and glass come from the ui-ux-pro-max style database; the
        hairline rating is my own assessment.
      </p>
    </Page>
  );
}
