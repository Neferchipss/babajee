import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { readSheet } from "./sheet.ts";

test("csv with quotes, commas in quotes and CRLF", () => {
  const bytes = strToU8('Name,Qty\n"Grinder, 4pc",3\r\n');
  assert.deepEqual(readSheet({ name: "a.csv", bytes }), [
    ["Name", "Qty"],
    ["Grinder, 4pc", "3"],
  ]);
});

test("xlsx: shared strings, numbers, inline strings, empty cells", () => {
  const files = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Note &amp; more</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12</v></c></row>' +
        "</sheetData></worksheet>",
    ),
    "xl/sharedStrings.xml": strToU8(
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>Name</t></si><si><t>Qty</t></si><si><r><t>Co</t></r><r><t>ne</t></r></si></sst>',
    ),
  };
  const bytes = zipSync(files);
  assert.deepEqual(readSheet({ name: "b.xlsx", bytes }), [
    ["Name", "Qty", "", "Note & more"],
    ["Cone", "12", "", ""],
  ]);
});

test("other file types are refused", () => {
  assert.throws(
    () => readSheet({ name: "x.pdf", bytes: new Uint8Array() }),
    /Only \.xlsx or \.csv files/,
  );
});
