// Where the shop lives, for the full addresses search engines need (the
// sitemap, robots.txt, structured data). NEXT_PUBLIC_SITE_URL is the domain
// (https://babajee.in once it's live); the base path is set by the build
// (/babajee on the GitHub Pages preview, nothing on a domain of its own).
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://neferchipss.github.io").replace(/\/$/, "");
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// "/shop/grinder/" -> "https://babajee.in/shop/grinder/"; a full address is kept
export const absUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${SITE_ORIGIN}${path.startsWith(BASE_PATH + "/") && BASE_PATH ? "" : BASE_PATH}${path}`);
