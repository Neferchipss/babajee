"use client";

// Staff roles (migration 0072) on the admin screens: who sees which page,
// and the two-step sign-in. The database enforces the same limits; this
// keeps people from opening pages their role can't use.
import { useCallback, useEffect, useState } from "react";
import { isAdminDemo } from "./admin-api";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";

export type StaffRole = "owner" | "admin" | "accounts" | "storefront" | "frontend";
export type Area = "staff" | "money" | "catalog" | "content" | "look" | "settings" | "team" | "export" | "delete";

export const ROLES: { id: StaffRole; label: string; about: string }[] = [
  { id: "owner", label: "Owner", about: "Everything, including the team and who is an owner or admin." },
  { id: "admin", label: "Admin", about: "Everything except owners and admins: can add store account, storefront and front-end staff." },
  { id: "accounts", label: "Store account", about: "Orders, customers, stock, purchases, prices and costs, GST, profit and reports. Not settings, the team or deleting products." },
  { id: "storefront", label: "Storefront manager", about: "Products, photos, categories, collections, reviews, and the shop's banners, pages, blog, FAQs, menus and SEO. No orders, customers or money." },
  { id: "frontend", label: "Front-end UI", about: "The shop's look only: banners, homepage sections, menus and theme." },
];
export const roleLabel = (r: string | null | undefined) => ROLES.find((x) => x.id === r)?.label ?? "Staff";

const CAN: Record<Area, StaffRole[]> = {
  staff: ["owner", "admin", "accounts", "storefront", "frontend"],
  money: ["owner", "admin", "accounts"],
  catalog: ["owner", "admin", "accounts", "storefront"],
  content: ["owner", "admin", "storefront"],
  look: ["owner", "admin", "storefront", "frontend"],
  settings: ["owner", "admin"],
  team: ["owner", "admin"],
  export: ["owner", "admin"],
  delete: ["owner", "admin"],
};
export const can = (role: StaffRole | null, area: Area) => !!role && CAN[area].includes(role);

// which area an admin page belongs to (the longest matching path wins)
const PAGES: [string, Area][] = [
  ["/admin/orders", "money"],
  ["/admin/customers", "money"],
  ["/admin/analytics", "money"],
  ["/admin/products/stock-in", "money"],
  ["/admin/products/tax", "money"],
  ["/admin/products", "catalog"],
  ["/admin/storefront/pages", "content"],
  ["/admin/storefront", "look"],
  ["/admin/support", "money"],
  ["/admin/settings/team", "staff"],
  ["/admin/settings/activity", "money"],
  ["/admin/settings", "settings"],
  ["/admin", "staff"],
];
export function areaOf(path: string): Area {
  const p = path.replace(/\/$/, "") || "/";
  const hit = PAGES.filter(([pre]) => p === pre || p.startsWith(`${pre}/`)).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : "settings";
}
export const canOpen = (role: StaffRole | null, path: string) => can(role, areaOf(path));

export type Me = { role: StaffRole | null; enrolled: boolean; required: boolean; passed: boolean; active: boolean };

// the signed-in person's role and two-step state; a database without 0072
// treats every admin as an owner, as before
export function useStaff(): { me: Me | null; reload: () => void } {
  const { status, profile, user } = useAuth();
  const [got, setGot] = useState<{ key: string; me: Me } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const demo = typeof window !== "undefined" && isAdminDemo();
  const staff = !demo && status === "in" && profile?.role === "admin";
  const key = `${user?.id ?? ""}:${tick}`;
  useEffect(() => {
    if (!staff) return;
    let live = true;
    const sb = getSupabase();
    if (!sb) return;
    void sb.rpc("my_staff").then(({ data, error }) => {
      if (!live) return;
      const me: Me = error
        ? { role: "owner", enrolled: false, required: false, passed: true, active: true }
        : ((data as Me | null) ?? { role: null, enrolled: false, required: false, passed: false, active: false });
      setGot({ key, me });
    });
    return () => {
      live = false;
    };
  }, [staff, key]);
  if (demo) {
    const r = new URLSearchParams(window.location.search).get("role") as StaffRole | null;
    return { me: { role: ROLES.some((x) => x.id === r) ? r : "owner", enrolled: false, required: false, passed: true, active: true }, reload };
  }
  if (status !== "in" || !profile) return { me: null, reload };
  if (profile.role !== "admin") return { me: { role: null, enrolled: false, required: false, passed: false, active: false }, reload };
  return { me: got?.key === key ? got.me : null, reload };
}

// ---------------------------------------------------------------- two-step sign-in (TOTP)
function auth() {
  const sb = getSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  return sb.auth.mfa;
}

export async function twoStepFactors() {
  const { data, error } = await auth().listFactors();
  if (error) throw error;
  return data.totp.filter((f) => f.status === "verified");
}

// start setting it up: a QR code (an SVG data address) and the secret to type instead
export async function startTwoStep(): Promise<{ factorId: string; qr: string; secret: string }> {
  // an unfinished earlier attempt is cleared first
  const { data: all } = await auth().listFactors();
  for (const f of all?.all ?? []) if (f.status !== "verified") await auth().unenroll({ factorId: f.id });
  const { data, error } = await auth().enroll({ factorType: "totp", friendlyName: `Babajee ${new Date().toISOString().slice(0, 10)}` });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

// the 6-digit code from the app: finishes setting up, or passes the check at sign-in
export async function checkTwoStep(factorId: string, code: string) {
  const { error } = await auth().challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
  if (error) throw error;
}

export async function removeTwoStep(factorId: string) {
  const { error } = await auth().unenroll({ factorId });
  if (error) throw error;
}

// ---------------------------------------------------------------- the team
export type StaffMember = { id: string; name: string; email: string; role: StaffRole; two_step: boolean; last_sign_in: string | null; joined: string; me: boolean };

export async function setStaff(email: string, role: StaffRole | null) {
  const sb = getSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  const { error } = await sb.rpc("admin_set_staff", { p_email: email, p_role: role });
  if (error) throw error;
}

export async function setTwoStepRequired(on: boolean) {
  const sb = getSupabase();
  if (!sb) throw new Error("Not connected to the database.");
  const { error } = await sb.from("store_settings").update({ staff_2fa: on }).eq("id", 1);
  if (error) throw error;
}
