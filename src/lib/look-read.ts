// Reading site_look (content.ts getLook), kept apart so it can be tested. A
// database without 0087 has no colours column: the rest is read and the
// colours are Legacy. Any other failure throws, so a dropped connection is
// never taken for "the shop's colours are Legacy" (which would wipe the
// palette a page already shows, or show Legacy as live in the editor).
import type { ShopColours } from "./shop-colours.ts";

export type LookRow = { announcement: string; announcement_link: string; colours: ShopColours | null };
type Res = { data: Partial<LookRow> | null; error: { code?: string; message: string } | null };

const DEFAULTS: LookRow = { announcement: "", announcement_link: "", colours: null };
const NO_COLUMN = "42703";

export async function readLook(query: (cols: string) => Promise<Res>): Promise<LookRow> {
  let res = await query("announcement, announcement_link, colours");
  if (res.error?.code === NO_COLUMN) res = await query("announcement, announcement_link");
  if (res.error) throw new Error(res.error.message);
  return { ...DEFAULTS, ...(res.data ?? {}) };
}
