// Where light or dark is kept, and the line of the layout's boot script that
// puts it on <html data-mode> before the first paint (src/lib/mode.ts does
// the same once React is there). Plain values, so the server layout can use them.
export const MODE_KEY = "bj-mode";

export const modeBootScript = `var p=localStorage.getItem(${JSON.stringify(MODE_KEY)});var m=p==="light"||p==="dark"?p:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.mode=m;document.documentElement.dataset.modePref=p==="light"||p==="dark"?p:"system";`;
