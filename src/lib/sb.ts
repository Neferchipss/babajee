// The Supabase library is about 240 KB, so pages don't load it up front:
// loadSupabase() fetches it the first time something needs the database,
// after the page is already showing. supabase.ts holds the client itself.

export const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const loadSupabase = () => import("./supabase").then((m) => m.getSupabase());

// The site root as seen by the browser (handles the /babajee base path on
// Pages), used for links inside auth emails.
export function siteRoot() {
  const at = window.location.pathname.indexOf("/account");
  return window.location.origin + (at > 0 ? window.location.pathname.slice(0, at) : "");
}
