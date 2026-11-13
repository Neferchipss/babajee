// Ages from a date of birth (yyyy-mm-dd), counted in whole years as of today
// (India time is close enough: a birthday counts from the start of the day).
export function ageOf(dob: string | null | undefined, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
  return age;
}

// day, month and year as typed -> "yyyy-mm-dd", or why not
export function readDob(day: string, month: string, year: string, now = new Date()): { dob: string } | { error: string } {
  const [d, m, y] = [Number(day), Number(month), Number(year)];
  if (!day || !month || !year) return { error: "Enter your date of birth." };
  if (year.length !== 4 || y < 1900 || y > now.getFullYear()) return { error: "Enter the year in full, like 1998." };
  if (m < 1 || m > 12) return { error: "The month should be 1 to 12." };
  const real = new Date(y, m - 1, d);
  if (d < 1 || real.getMonth() !== m - 1) return { error: "That day isn't in that month." };
  if (real > now) return { error: "That date is in the future." };
  const dob = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { dob };
}

const LONG = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
// "3 Mar 1999"
export const dobLabel = (dob: string) => LONG.format(new Date(`${dob}T00:00:00Z`));
