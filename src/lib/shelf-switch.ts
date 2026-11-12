// Switching category: the current shelf dims (motion.css) from the click
// until the new shelf is on screen, so the click visibly took and nothing
// flashes blank. The new shelf calls shelfArrived(); a navigation that never
// lands clears itself after a while.
let timer = 0;
export function shelfLeaving() {
  const root = document.documentElement;
  root.dataset.shelfLeaving = "";
  window.clearTimeout(timer);
  timer = window.setTimeout(() => delete root.dataset.shelfLeaving, 8000);
}
export function shelfArrived() {
  window.clearTimeout(timer);
  delete document.documentElement.dataset.shelfLeaving;
}
