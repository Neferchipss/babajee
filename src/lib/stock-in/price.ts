// Buying prices are kept to the paisa, as the database stores them
// (admin_post_receipt rounds to 2 decimals before GST and the average).

// what a price box accepts while typing: digits, one dot, up to 2 decimals
const PRICE_RE = /^\d*(\.\d{0,2})?$/;
export const priceTyping = (text: string) => PRICE_RE.test(text);
// the number a price box holds; NaN until something is typed
export const priceOf = (text: string) => (text === "" || text === "." ? NaN : Number(text));
export const paisa = (x: number) => Math.round(x * 100 + 1e-7) / 100;
