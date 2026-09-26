"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase, supabaseConfigured } from "./supabase";

export type Profile = {
  full_name: string;
  phone: string;
  role: "customer" | "admin";
  age_verified_at: string | null;
};

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
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("profiles")
    .select("full_name, phone, role, age_verified_at")
    .eq("id", id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(supabaseConfigured ? "loading" : "off");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
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
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) setProfile(await fetchProfile(user.id));
  }, [user]);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ status, user, profile, recovery, refreshProfile, signOut }),
    [status, user, profile, recovery, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
