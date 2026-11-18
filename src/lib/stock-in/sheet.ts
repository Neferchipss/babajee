import { unzipSync, strFromU8 } from "fflate";

type SheetFile = { name: string; bytes: Uint8Array };

/** Reads a .csv or the first worksheet of an .xlsx into rows of strings. */
export function readSheet(file: SheetFile): string[][] {
  const lower = file.name.toLowerCase();
  let rows: string[][];
  if (lower.endsWith(".csv")) rows = readCsv(strFromU8(file.bytes));
  else if (lower.endsWith(".xlsx")) rows = readXlsx(file.bytes);
  else throw new Error("Only .xlsx or .csv files");
  return pad(rows);
}

function pad(rows: string[][]): string[][] {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return rows.map((r) => {
    const out = r.slice();
    while (out.length < width) out.push("");
    return out;
  });
}

function readCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

function textRuns(xml: string): string {
  let out = "";
  const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += unescapeXml(m[1] ?? "");
  return out;
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, "").toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

function readXlsx(bytes: Uint8Array): string[][] {
  const zip = unzipSync(bytes);
  const get = (p: string) => (zip[p] ? strFromU8(zip[p]) : null);

  const shared: string[] = [];
  const sst = get("xl/sharedStrings.xml");
  if (sst) {
    const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sst))) shared.push(textRuns(m[1] ?? ""));
  }

  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = get("xl/workbook.xml");
  const rels = get("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const sheet = /<sheet\b([^>]*?)\/?>/.exec(wb);
    const rid = sheet ? attr(sheet[1], "r:id") : null;
    if (rid) {
      const re = /<Relationship\b([^>]*?)\/?>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(rels))) {
        if (attr(m[1], "Id") === rid) {
          const target = attr(m[1], "Target");
          if (target) {
            sheetPath = target.startsWith("/")
              ? target.slice(1)
              : "xl/" + target.replace(/^\.\//, "");
          }
          break;
        }
      }
    }
  }
  const xml = get(sheetPath);
  if (!xml) throw new Error("Could not find a worksheet in this file");

  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  let nextRow = 0;
  while ((rm = rowRe.exec(xml))) {
    const rAttr = attr(rm[1], "r");
    const rowIdx = rAttr ? parseInt(rAttr, 10) - 1 : nextRow;
    nextRow = rowIdx + 1;
    while (rows.length < rowIdx) rows.push([]);
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let nextCol = 0;
    while ((cm = cellRe.exec(rm[2] ?? ""))) {
      const ref = attr(cm[1], "r");
      const col = ref ? colIndex(ref) : nextCol;
      nextCol = col + 1;
      const t = attr(cm[1], "t");
      const body = cm[2] ?? "";
      let value = "";
      if (t === "inlineStr") value = textRuns(body);
      else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        if (v) {
          const raw = unescapeXml(v[1]);
          value = t === "s" ? (shared[parseInt(raw, 10)] ?? "") : raw;
        }
      }
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    rows[rowIdx] = cells;
  }
  return rows;
}
