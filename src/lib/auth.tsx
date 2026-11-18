"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { linkCart } from "./cart";
import { loadSupabaseNow } from "./sb";
import { linkSaved } from "./wishlist";

// The provider sits in the root layout, but the Supabase client is about
// 60 KB that only the account and admin pages need straight away. So it is
// loaded on its own: at once on those pages and checkout (saved addresses),
// and elsewhere once the page has settled (a session left from a sign-in is
// still picked up, just later).
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const loadClient = loadSupabaseNow;
const NEEDS_SESSION = /^\/(account|admin|checkout)(\/|$)/;

export type Profile = {
  full_name: string;
  phone: string;
  role: "customer" | "admin";
  age_verified_at: string | null;
  date_of_birth: string | null;
  // 0066: names apart, gender, individual or business (with its GSTIN), and
  // the account's status; blank or the defaults until that is in place
  first_name: string;
  last_name: string;
  gender: "" | "female" | "male" | "other";
  customer_type: "individual" | "business";
  business_name: string;
  gstin: string;
  status: "active" | "inactive" | "blocked";
};
const PROFILE_EXTRAS = { first_name: "", last_name: "", gender: "", customer_type: "individual", business_name: "", gstin: "", status: "active" } as const;

type Status = "off" | "loading" | "out" | "in";

type AuthValue = {
  status: Status;
  user: User | null;
  profile: Profile | null;
  // True when the person arrived from a password-reset email.
  recovery: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  status: "off",
  user: null,
  profile: null,
  recovery: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

async function fetchProfile(id: string): Promise<Profile | null> {
  const sb = await loadClient();
  if (!sb) return null;
  const [{ data }, extras] = await Promise.all([
    sb.from("profiles").select("full_name, phone, role, age_verified_at, date_of_birth").eq("id", id).maybeSingle(),
    // read on their own, so a database without 0066 still signs people in
    sb.from("profiles").select("first_name, last_name, gender, customer_type, business_name, gstin, status").eq("id", id).maybeSingle(),
  ]);
  if (!data) return null;
  return { ...PROFILE_EXTRAS, ...(extras.error ? {} : (extras.data ?? {})), ...data } as Profile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(configured ? "loading" : "off");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovery, setRecovery] = useState(false);
  const started = useRef(false);
  const unsubscribe = useRef(() => {});
  const urgent = NEEDS_SESSION.test(usePathname());

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    const sb = await loadClient();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      const next = session?.user ?? null;
      setUser(next);
      setStatus(next ? "in" : "out");
      if (!next) {
        setProfile(null);
        return;
      }
      // Never call back into supabase inside this callback; defer it.
      setTimeout(() => {
        fetchProfile(next.id).then(setProfile);
      }, 0);
    });
    unsubscribe.current = () => data.subscription.unsubscribe();
  }, []);

  // saved products and the cart follow the account: merged on sign-in
  // (lib/wishlist.ts, lib/cart.ts)
  const uid = user?.id ?? null;
  useEffect(() => {
    if (status === "loading") return;
    void linkSaved(uid);
    void linkCart(uid);
  }, [uid, status]);

  // on the account and admin pages at once (including arriving there later)
  useEffect(() => {
    if (configured && urgent) start();
  }, [urgent, start]);

  // everywhere else, once the page has settled
  useEffect(() => {
    if (!configured) return;
    const later = () => (window.requestIdleCallback ?? ((f: () => void) => f()))(() => void start());
    const idle = window.setTimeout(later, 2500);
    return () => {
      window.clearTimeout(idle);
      unsubscribe.current();
    };
  }, [start]);

  const refreshProfile = useCallback(async () => {
    if (user) setProfile(await fetchProfile(user.id));
  }, [user]);

  const signOut = useCallback(async () => {
    await (await loadClient())?.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ status, user, profile, recovery, refreshProfile, signOut }),
    [status, user, profile, recovery, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
