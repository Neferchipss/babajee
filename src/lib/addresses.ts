// A saved delivery address (public.addresses, see supabase/migrations/0002).
// Row-level security keeps each customer to their own rows.
export type Address = {
  id: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
};

export type AddressInput = Omit<Address, "id">;

export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export const EMPTY_ADDRESS: AddressInput = {
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  is_default: false,
};

// 10-digit Indian mobile; accepts spaces, dashes and a +91 / 0 prefix.
export function cleanPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

// Field name -> message, empty when the address is good to save.
export function checkAddress(a: AddressInput): Partial<Record<keyof AddressInput, string>> {
  const errors: Partial<Record<keyof AddressInput, string>> = {};
  if (!a.recipient_name.trim()) errors.recipient_name = "Who should we deliver to?";
  if (!/^[6-9]\d{9}$/.test(cleanPhone(a.phone))) errors.phone = "Enter a 10-digit mobile number.";
  if (!a.line1.trim()) errors.line1 = "Add the house and street.";
  if (!a.city.trim()) errors.city = "Add the city.";
  if (!STATES.includes(a.state)) errors.state = "Pick a state.";
  if (!/^[1-9]\d{5}$/.test(a.pincode.trim())) errors.pincode = "PIN codes are 6 digits.";
  return errors;
}

export function tidy(a: AddressInput): AddressInput {
  return {
    recipient_name: a.recipient_name.trim().slice(0, 120),
    phone: cleanPhone(a.phone),
    line1: a.line1.trim().slice(0, 200),
    line2: a.line2.trim().slice(0, 200),
    landmark: a.landmark.trim().slice(0, 120),
    city: a.city.trim().slice(0, 80),
    state: a.state,
    pincode: a.pincode.trim(),
    is_default: a.is_default,
  };
}

export function addressLines(a: AddressInput) {
  return [
    [a.line1, a.line2].filter(Boolean).join(", "),
    a.landmark && `Near ${a.landmark}`,
    `${a.city}, ${a.state} ${a.pincode}`,
  ].filter(Boolean) as string[];
}
