// Printed sheets (reports, purchase bills, stock lists) laid out the way
// Aronium prints them: a white A4 page with a bold title, a two-column block
// of details, a boxed table and a totals row. This file is the arithmetic:
// how wide each column is, how tall each row comes out, and which rows land
// on which page, so a long table breaks across pages with its header row
// repeated and nothing cut in half. Everything is in CSS pixels at 96 per
// inch, the same units the sheet is drawn in (components/admin/print).

export type SheetAlign = "l" | "r" | "c";
export type SheetCol = { label: string; align?: SheetAlign };
// a table row, or a group's heading across the whole row (the inventory
// count's product groups)
export type SheetRow = { cells: string[]; group?: undefined } | { group: string; cells?: undefined };
export type SheetPair = [string, string];
// boxes printed under the table on the last page: a GST summary, totals
export type SheetBox = { title?: string; lines: { label: string; value: string; strong?: boolean }[] };
export type SheetDoc = {
  title: string;
  // the details under the title: left column and right column, as Aronium
  // prints Period/Customer/User on the left and Company/Address on the right
  meta?: SheetPair[];
  metaRight?: SheetPair[];
  cols: SheetCol[];
  rows: SheetRow[];
  // the totals row, boxed under the columns that have one
  totals?: (string | null)[];
  boxes?: SheetBox[];
  notes?: string[];
  // shown across the corner, e.g. "VOIDED" or "TEST"
  stamp?: string;
  // the file name for Excel and the print window's PDF
  file?: string;
};

// A4 at 96 px per inch, with Aronium's margins; a sheet too wide for the
// page upright turns sideways (Aronium prints wide reports in landscape)
export const PAGE = { w: 794, h: 1123, mx: 45, my: 42, foot: 22 };
export type Paper = { land: boolean; w: number; h: number; bodyW: number; bodyH: number };
export const paper = (land: boolean): Paper => {
  const w = land ? PAGE.h : PAGE.w;
  const h = land ? PAGE.w : PAGE.h;
  return { land, w, h, bodyW: w - 2 * PAGE.mx, bodyH: h - 2 * PAGE.my - PAGE.foot };
};
export const BODY_W = paper(false).bodyW;
export const BODY_H = paper(false).bodyH;
// 11px Arial: an average character is about 6px wide (a bold one 6.6); a
// line is 14px
const CH = 6;
const BOLD = 6.6;
const LINE = 14;
const PAD = 8;
const ROW_PAD = 5;
// a cell's longest unbroken run (an email, a code) counts up to this many
// characters; anything longer may break (headers never do)
const TOKEN_CAP = 22;

const isNumberish = (s: string) => /^[-−]?[₹]?\s?[\d,]+(\.\d+)?\s?%?$/.test(s.trim()) || s.trim() === "–";
const longestWord = (t: string) => t.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);

// The narrowest each column can be without breaking inside a word: its
// header's longest word (bold) and its cells' longest word (capped), or a
// number column's longest number.
export function minWidths(cols: SheetCol[], rows: SheetRow[]): number[] {
  return cols.map((c, i) => {
    const numeric = rows.every((r) => !r.cells || !r.cells[i] || isNumberish(r.cells[i]));
    const cellWord = rows.reduce((m, r) => (r.cells ? Math.max(m, numeric ? (r.cells[i] ?? "").length : Math.min(longestWord(r.cells[i] ?? ""), TOKEN_CAP)) : m), 0);
    return Math.ceil(Math.max(longestWord(c.label) * BOLD, cellWord * CH, 3 * CH) + PAD);
  });
}

// Each column's width: what its content would like (the longest cell, capped
// so one long name can't take the page), scaled to fill the page's width, but
// never under its narrowest (minWidths). What a column is short of comes off
// the widest text columns (Product, Customer) first.
export function columnWidths(cols: SheetCol[], rows: SheetRow[], width = BODY_W): number[] {
  if (!cols.length) return [];
  const min = minWidths(cols, rows);
  const want = cols.map((c, i) => {
    const longest = rows.reduce((m, r) => (r.cells ? Math.max(m, (r.cells[i] ?? "").length) : m), 0);
    const numeric = rows.every((r) => !r.cells || !r.cells[i] || isNumberish(r.cells[i]));
    const chars = numeric ? Math.max(longest, 4) : Math.min(Math.max(longest, 6), 38);
    return Math.max(chars * CH + PAD, min[i]);
  });
  const sum = want.reduce((a, b) => a + b, 0);
  const w = want.map((x) => x * (width / sum));
  // raise anything under its floor, taking the room from columns with slack
  for (let pass = 0; pass < 4; pass += 1) {
    const short = w.reduce((a, x, i) => a + Math.max(0, min[i] - x), 0);
    if (short <= 0.5) break;
    w.forEach((x, i) => (w[i] = Math.max(x, min[i])));
    const slack = w.map((x, i) => Math.max(0, x - min[i]));
    const total = slack.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    w.forEach((x, i) => (w[i] = x - (short * slack[i]) / total));
  }
  return w.map((x) => Math.floor(x));
}

// upright, unless the columns' floors don't fit across an upright page
export const needsLandscape = (cols: SheetCol[], rows: SheetRow[]) => minWidths(cols, rows).reduce((a, b) => a + b, 0) > BODY_W;

// how many lines a piece of text takes in a column that wide
// (words wrap whole; only a word longer than the line itself is split)
export function linesFor(text: string, width: number, ch = CH): number {
  if (!text) return 1;
  const per = Math.max(1, Math.floor((width - PAD) / ch));
  let lines = 0;
  for (const part of text.split("\n")) {
    let n = 1;
    let used = 0;
    for (const word of part.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (len > per) {
        // a word too long for the line: it starts a line and breaks
        if (used) n += 1;
        n += Math.ceil(len / per) - 1;
        used = len % per || per;
        continue;
      }
      if (used && used + 1 + len > per) {
        n += 1;
        used = len;
      } else used += (used ? 1 : 0) + len;
    }
    lines += n;
  }
  return lines;
}

export function rowHeight(row: SheetRow, widths: number[]): number {
  if (!row.cells) return LINE + ROW_PAD + 4;
  const lines = Math.max(1, ...row.cells.map((c, i) => linesFor(c ?? "", widths[i] ?? BODY_W)));
  return lines * LINE + ROW_PAD;
}

export function headHeight(cols: SheetCol[], widths: number[]): number {
  // bold labels run a little wider
  const lines = Math.max(1, ...cols.map((c, i) => linesFor(c.label, widths[i] ?? BODY_W, BOLD)));
  return lines * LINE + ROW_PAD + 2;
}

// the title and the details block on the first page
export function topHeight(doc: Pick<SheetDoc, "meta" | "metaRight">, bodyW = BODY_W): number {
  const pairs = Math.max(doc.meta?.length ?? 0, doc.metaRight?.length ?? 0);
  const valueLines = (list: SheetPair[] | undefined) => (list ?? []).reduce((n, [, v]) => n + Math.max(1, linesFor(v, bodyW / 2 - 110)) - 1, 0);
  const extra = Math.max(valueLines(doc.meta), valueLines(doc.metaRight));
  return 36 + (pairs + extra) * 17 + 14;
}

// what follows the table on the last page: the totals row, the boxes, notes
export function tailHeight(doc: Pick<SheetDoc, "totals" | "boxes" | "notes">, bodyW = BODY_W): number {
  let h = 0;
  if (doc.totals?.some((t) => t)) h += LINE + ROW_PAD + 4;
  for (const b of doc.boxes ?? []) h += 14 + (b.title ? 18 : 0) + b.lines.length * 17;
  for (const n of doc.notes ?? []) h += 8 + linesFor(n, bodyW) * LINE;
  return h;
}

// Which rows go on which page. The first page is shorter (the title and
// details sit on it); every page repeats the header row; the tail must fit
// under the last rows, or it moves to a page of its own. A row taller than a
// whole page still gets a page to itself rather than looping forever.
// Returns [start, end) row ranges, one per page; the last range may be empty
// when only the tail is on that page.
export function paginate(heights: number[], o: { first: number; rest: number; head: number; tail: number }): [number, number][] {
  const pages: [number, number][] = [];
  let i = 0;
  let room = o.first;
  while (i < heights.length) {
    const start = i;
    let used = o.head;
    while (i < heights.length && (used + heights[i] <= room || i === start)) {
      used += heights[i];
      i += 1;
    }
    pages.push([start, i]);
    if (i >= heights.length) {
      // the tail under the last rows, or on a page of its own
      if (o.tail > 0 && used + o.tail > room) pages.push([i, i]);
      return pages;
    }
    room = o.rest;
  }
  // no rows at all: one page with the head (and the tail, if any)
  pages.push([0, 0]);
  return pages;
}

// the whole layout of one sheet: which way the paper turns, column widths
// and each page's rows
export function layout(doc: SheetDoc) {
  const p = paper(needsLandscape(doc.cols, doc.rows));
  const widths = columnWidths(doc.cols, doc.rows, p.bodyW);
  const heights = doc.rows.map((r) => rowHeight(r, widths));
  const head = headHeight(doc.cols, widths);
  const pages = paginate(heights, { first: p.bodyH - topHeight(doc, p.bodyW), rest: p.bodyH, head, tail: tailHeight(doc, p.bodyW) });
  return { paper: p, widths, pages };
}

// a sheet's table as a CSV file (opens in Excel), the same columns as printed
export function sheetCsv(doc: SheetDoc): string {
  const cell = (v: string | null | undefined) => {
    const t = v ?? "";
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [doc.cols.map((c) => cell(c.label)).join(",")];
  for (const r of doc.rows) lines.push(r.cells ? r.cells.map(cell).join(",") : cell(r.group));
  if (doc.totals?.some((t) => t)) lines.push(doc.totals.map(cell).join(","));
  return "﻿" + lines.join("\r\n");
}
