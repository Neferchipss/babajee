// How many of an option count as "in stock" when its stock isn't counted
// (track_stock off): always enough. Shared by the build-time catalogue
// (catalog-db) and the cart's stock check, kept apart so the cart doesn't
// load the whole catalogue module for one number.
export const UNCOUNTED = 999;
