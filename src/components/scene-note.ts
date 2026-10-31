// A note from a "shop" button to the 3D shop it opens: start already inside,
// the walk in done, and step back out of the shelf you came from. Without it
// (the logo, a reload, a new visit) the landing starts out on the street.
// Kept apart from ShopScene, so a button that leaves the note does not pull
// in three.js.

const NOTE = "babajee:start-inside";

// from: the category page being left (its slug), to step back out of its shelf
export function enterShop(from?: string) {
  try {
    sessionStorage.setItem(NOTE, from || "-");
  } catch {}
}

// the logo, clicked on the landing itself: the scene walks back out to the street
export const TO_STREET = "babajee:to-street";

// the note: "" if there is none, "-" for inside, or a category's slug. It is left
// in place (the scene may be set up twice over, in development) until clearShopNote
export function peekShopNote() {
  try {
    return sessionStorage.getItem(NOTE) ?? "";
  } catch {
    return "";
  }
}
export function clearShopNote() {
  try {
    sessionStorage.removeItem(NOTE);
  } catch {}
}
