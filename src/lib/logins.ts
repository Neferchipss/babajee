import { getSupabase } from "./supabase";

// Login history (migration 0040): sign-ins recorded by the database when a
// session starts, and failed attempts reported by the login form. Admins only.
export type LoginEvent = {
  id: number;
  profile_id: string | null;
  email: string;
  name: string;
  ok: boolean;
  reason: string;
  user_agent: string;
  ip: string;
  at: string;
};

export async function loginEvents(opts: { profile?: string; failedOnly?: boolean; limit?: number } = {}): Promise<LoginEvent[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("admin_login_events", { p_profile: opts.profile ?? null, p_failed_only: opts.failedOnly ?? false, p_limit: opts.limit ?? 200 });
  if (error) throw error;
  return (data ?? []) as LoginEvent[];
}

// "Chrome on Android", "Safari on iPhone", from the browser's description
export function deviceOf(ua: string): string {
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "";
  if (!os && !browser) return ua.slice(0, 40);
  return [browser, os].filter(Boolean).join(" on ");
}
