import { getSupabase } from "./supabase";
import { tidy, type Address, type AddressInput } from "./addresses";

// Reads and writes for saved addresses. Kept apart from ./addresses so pages
// can use the form helpers without loading the Supabase client.
const COLUMNS = "id, recipient_name, phone, line1, line2, landmark, city, state, pincode, is_default, label, latitude, longitude";

// The signed-in customer's own addresses, the default first, then newest.
// Filtered to their account here: the database also lets admins read every
// customer's addresses, which must never land in an admin's own checkout.
export async function listAddresses(): Promise<Address[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data: auth } = await sb.auth.getSession();
  const me = auth.session?.user.id;
  if (!me) return [];
  const { data, error } = await sb
    .from("addresses")
    .select(COLUMNS)
    .eq("profile_id", me)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Address[];
}

// Insert when there is no id, update otherwise. The database keeps a single
// default per customer, so marking this one default clears the others.
export async function saveAddress(profileId: string, a: AddressInput, id?: string): Promise<Address> {
  const sb = getSupabase();
  if (!sb) throw new Error("not connected");
  const row = tidy(a);
  const query = id
    ? sb.from("addresses").update(row).eq("id", id)
    : sb.from("addresses").insert({ ...row, profile_id: profileId });
  const { data, error } = await query.select(COLUMNS).single();
  if (error) throw error;
  return data as Address;
}

export async function deleteAddress(id: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("not connected");
  const { error } = await sb.from("addresses").delete().eq("id", id);
  if (error) throw error;
}

export async function makeDefault(id: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("not connected");
  const { error } = await sb.from("addresses").update({ is_default: true }).eq("id", id);
  if (error) throw error;
}

// The customer's default billing address (0066), read on its own: null when
// there is none, or before that is in place.
export async function billingDefault(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: auth } = await sb.auth.getSession();
  const me = auth.session?.user.id;
  if (!me) return null;
  const { data, error } = await sb.from("addresses").select("id").eq("profile_id", me).eq("is_default_billing", true).maybeSingle();
  return error ? null : ((data?.id as string | undefined) ?? null);
}

// one default billing address: marking this one clears the others (0066)
export async function makeBillingDefault(id: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("not connected");
  const { error } = await sb.from("addresses").update({ is_default_billing: true }).eq("id", id);
  if (error) throw error;
}
