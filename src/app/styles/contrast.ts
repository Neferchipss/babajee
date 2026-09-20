export type RGB = [number, number, number];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function ratio(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// fg painted at `alpha` over bg
export const over = (fg: RGB, alpha: number, bg: RGB): RGB =>
  [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;

export const css = ([r, g, b]: RGB, a = 1) => `rgb(${r} ${g} ${b} / ${a})`;
