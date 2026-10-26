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
  label: AddressLabel;
  // where the customer dropped the pin on the map (null when not pinned)
  latitude: number | null;
  longitude: number | null;
};

export const LABELS = ["Home", "Work", "Other"] as const;
export type AddressLabel = (typeof LABELS)[number];

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
  label: "Home",
  latitude: null,
  longitude: null,
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
  if (!a.line1.trim()) errors.line1 = "Add the flat or house number and building.";
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
    label: LABELS.includes(a.label) ? a.label : "Home",
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

export function addressLines(a: AddressInput) {
  return [
    [a.line1, a.line2].filter(Boolean).join(", "),
    a.landmark && `Near ${a.landmark}`,
    `${a.city}, ${a.state} ${a.pincode}`,
  ].filter(Boolean) as string[];
}

export type Pin = { lat: number; lng: number };

// What the map knows about a pinned spot, ready to drop into the form.
export type Place = {
  area: string; // suburb, e.g. "Khar"
  street: string; // road and neighbourhood, without the area
  city: string;
  state: string; // one of STATES, or "" when it could not be matched
  pincode: string;
};

// The geocoder's state names don't always match the list above.
function matchState(name: string) {
  const n = name.toLowerCase().replace(/^(state of|union territory of|national capital territory of)\s+/, "").trim();
  return STATES.find((s) => s.toLowerCase() === n) ?? STATES.find((s) => n.includes(s.toLowerCase())) ?? "";
}

// Pin -> street, area, city, state and PIN code. OpenStreetMap's Nominatim
// first: it knows suburbs and PIN codes in Indian cities. BigDataCloud (the
// shop header's lookup, city-level only) stands in if Nominatim fails.
export async function placeAt(pin: Pin): Promise<Place> {
  try {
    return await nominatimAt(pin);
  } catch {
    return bigDataCloudAt(pin);
  }
}

async function nominatimAt({ lat, lng }: Pin): Promise<Place> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`,
    { headers: { "Accept-Language": "en" } },
  );
  if (!r.ok) throw new Error(`reverse ${r.status}`);
  const a = (await r.json()).address ?? {};
  // Big cities often come back as a district ("Mumbai City District",
  // "Mumbai Suburban District"): keep the city's name.
  const district = String(a.state_district || a.county || "").replace(/\s+(city\s+|suburban\s+)?district$/i, "");
  const city = a.city || a.town || a.village || district;
  const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || city;
  const street = [a.road, a.neighbourhood !== area ? a.neighbourhood : ""].filter(Boolean).join(", ");
  return {
    area,
    street,
    city,
    state: matchState(a.state ?? ""),
    pincode: /^[1-9]\d{5}$/.test(a.postcode ?? "") ? a.postcode : "",
  };
}

async function bigDataCloudAt({ lat, lng }: Pin): Promise<Place> {
  const r = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
  );
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  const d = await r.json();
  return {
    area: d.locality || d.city || "",
    street: "",
    city: d.city || d.locality || "",
    state: matchState(d.principalSubdivision ?? ""),
    pincode: /^[1-9]\d{5}$/.test(d.postcode ?? "") ? d.postcode : "",
  };
}

// Place name -> pin, for the search box on the map. OpenStreetMap's
// Nominatim, limited to India; it asks for at most one search a second,
// so it runs on submit only.
export async function findPlace(query: string): Promise<(Pin & { name: string })[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=5&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!r.ok) throw new Error(`search ${r.status}`);
  const rows: { lat: string; lon: string; display_name: string }[] = await r.json();
  return rows.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), name: x.display_name }));
}

// A confirmed pin fills in what the map knows. What the customer already
// typed for area/street wins; city, state and PIN follow the pin.
export function withPlace(a: AddressInput, pin: Pin, place: Place | null): AddressInput {
  return {
    ...a,
    latitude: pin.lat,
    longitude: pin.lng,
    line2: a.line2 || [place?.street, place?.area !== place?.city ? place?.area : ""].filter(Boolean).join(", "),
    city: place?.city || a.city,
    state: place?.state || a.state,
    pincode: place?.pincode || a.pincode,
  };
}

// One line for tight spots, e.g. the header: "Hill Road, Khar, Mumbai 400050"
export function shortLine(a: Pick<AddressInput, "line2" | "city" | "pincode">) {
  const area = a.line2.trim().toLowerCase() === a.city.trim().toLowerCase() ? "" : a.line2;
  return [area, [a.city, a.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
