// The Supabase library is about 240 KB, so pages don't load it up front:
// loadSupabase() fetches it the first time something needs the database,
// after the page is already showing. supabase.ts holds the client itself.

export const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// The page settles first: the library is fetched once the page has loaded
// and the phone is idle (at most 1.5 s more), so it never competes with
// what the shopper is waiting to see. Taps and sign-ins come later anyway.
// Once it has loaded (say the account pages asked for it at once), nobody
// waits again.
let settled: Promise<void> | null = null;
export function afterLoad(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return (settled ??= new Promise<void>((done) => {
    const idle = () => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => done(), { timeout: 1500 });
      else window.setTimeout(done, 200);
    };
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
  }));
}

let lib: Promise<typeof import("./supabase")> | null = null;
const importNow = () => (lib ??= import("./supabase"));

// for pages that need the database straight away (account, admin, checkout)
export const loadSupabaseNow = () => importNow().then((m) => m.getSupabase());

export const loadSupabase = () => (lib ? importNow() : afterLoad().then(importNow)).then((m) => m.getSupabase());

// The site root as seen by the browser (handles the /babajee base path on
// Pages), used for links inside auth emails.
export function siteRoot() {
  const at = window.location.pathname.indexOf("/account");
  return window.location.origin + (at > 0 ? window.location.pathname.slice(0, at) : "");
}
