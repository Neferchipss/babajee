// A page's body is plain text with a few marks: "## " a heading, "- " a list
// line, a blank line between paragraphs, **bold**, and [words](/link). Turned
// into blocks here (never raw HTML), so nothing typed can run on the shop.
export type Block = { type: "h"; text: string } | { type: "p"; text: string } | { type: "ul"; items: string[] };
export function blocks(body: string): Block[] {
  const out: Block[] = [];
  for (const chunk of body.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*] /.test(l))) out.push({ type: "ul", items: lines.map((l) => l.replace(/^\s*[-*] /, "")) });
    else if (/^#{1,3} /.test(lines[0])) {
      out.push({ type: "h", text: lines[0].replace(/^#{1,3} /, "") });
      if (lines.length > 1) out.push({ type: "p", text: lines.slice(1).join("\n") });
    } else out.push({ type: "p", text: lines.join("\n") });
  }
  return out;
}

// inline marks: **bold** and [label](href) (https or a path on the shop only)
export type Inline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "a"; v: string; href: string };
export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^)\s]+|\/[^)\s]*)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1]) out.push({ t: "b", v: m[1] });
    else out.push({ t: "a", v: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}
