// Calendar days as the shop sees them (India time), as YYYY-MM-DD strings
// for the database's date parameters.
const IN = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

// today, or `offset` days from it
export function isoDay(offset = 0, from = new Date()) {
  return IN.format(new Date(from.getTime() + offset * 864e5));
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 864e5) + 1;
}

const SHORT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const dayLabel = (iso: string) => SHORT.format(new Date(`${iso}T12:00:00Z`));
