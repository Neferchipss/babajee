import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Both values are public by design (the key is the publishable/anon key; what
// a visitor may do is decided by row-level security in the database). Read at
// build time, so the site works with no backend until they are set.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

// Browser client. Sessions live in localStorage, so this also works on the
// static GitHub Pages preview. Returns null when the site is not connected.
export function getSupabase(): SupabaseClient | null {
  if (!URL || !KEY || typeof window === "undefined") return null;
  client ??= createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

// The site root as seen by the browser (handles the /babajee base path on
// Pages), used for links inside auth emails.
export function siteRoot() {
  const at = window.location.pathname.indexOf("/account");
  return window.location.origin + (at > 0 ? window.location.pathname.slice(0, at) : "");
}
