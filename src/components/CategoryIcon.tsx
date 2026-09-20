// Placeholder line icons for the categories, one per slug. Swap any of them
// for real artwork later; the nav only cares that each slug renders something.
const PATHS: Record<string, React.ReactNode> = {
  all: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  "rolling-paper": (
    <>
      <path d="M6 3.5h9l3.5 3.5v13.5H6z" />
      <path d="M15 3.5V7h3.5M9 12h6M9 16h6" />
    </>
  ),
  accessory: (
    <>
      <rect x="3.5" y="8" width="17" height="11.5" rx="2" />
      <path d="M9 8V5.5h6V8M3.5 13.5h17" />
    </>
  ),
  "rolling-tray": (
    <>
      <path d="M3 11.5h18l-1.6 6.3a2 2 0 0 1-1.9 1.5h-11a2 2 0 0 1-1.9-1.5z" />
      <path d="M8 11.5V8.5M12 11.5V7M16 11.5V8.5" />
    </>
  ),
  storage: (
    <>
      <path d="M8 3.5h8v3H8z" />
      <path d="M7 6.5h10v13.5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM7 12h10" />
    </>
  ),
  bong: (
    <>
      <path d="M10 3.5v7a5.5 5.5 0 1 0 4 0v-7M8.8 3.5h6.4M8 15.5h8" />
    </>
  ),
  "bong-accessory": (
    <>
      <path d="M5.5 7.5h9.5l-2.2 5.5H7.7z" />
      <path d="M10.2 13v7M15 9h4.5" />
    </>
  ),
  ashtray: (
    <>
      <path d="M3 14h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 14v-2.5M15 14v-2.5M12 9c-1-1-1-2.2 0-3.5" />
    </>
  ),
  pipe: (
    <>
      <path d="M4 5.5h7.5l-.5 7a5 5 0 0 0 5 4.5h4" />
      <path d="M4 5.5l1 6.5h6" />
    </>
  ),
  grinder: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" />
    </>
  ),
  filter: (
    <>
      <rect x="3" y="9" width="18" height="6" rx="3" />
      <path d="M14 9v6M17 9v6" />
    </>
  ),
  "rolling-tobacco": (
    <>
      <path d="M5 19C5 10.5 10 5 19.5 4c0 10-5 15-14.500 15z" />
      <path d="M5 19 14 10" />
    </>
  ),
  roach: (
    <>
      <rect x="4" y="12" width="12" height="4" rx="1.5" transform="rotate(-25 10 14)" />
      <path d="M18 5.5c1.2 1 1.2 2.2 0 3.2" />
    </>
  ),
  cigars: (
    <>
      <rect x="3" y="10" width="15.5" height="4.5" rx="2" />
      <path d="M14.5 10v4.5M20.5 8c1.2 1.2 1.2 2.6 0 3.8" />
    </>
  ),
  lighter: (
    <>
      <path d="M8 10.5h8v9.5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" />
      <path d="M11 10.5V8h3v2.500M12.5 3c1.700 1.300 1.700 2.900 0 4-1.700-1.100-1.700-2.700 0-4z" />
    </>
  ),
  "blunt-wraps": (
    <>
      <path d="M4 8c0-1.800 3.500-3 8-3s8 1.200 8 3-3.500 3-8 3-8-1.200-8-3z" />
      <path d="M4 8v8c0 1.800 3.500 3 8 3s8-1.200 8-3V8" />
    </>
  ),
  "cleaning-accessory": (
    <>
      <path d="M10 3.500h4v3.500h-4zM8.500 7h7l1 3.500v9.500h-9V10.500z" />
      <path d="M8 14h8" />
    </>
  ),
  "blunt-pre-rolled-cone": (
    <>
      <path d="M6 4.500h12l-4 15.500h-4z" />
      <path d="M8.500 11h7" />
    </>
  ),
  keychain: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 8.500 8.500M15.500 15.500l2.200-2.200M18 18l2-2" />
    </>
  ),
  "lighter-refills": <path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11z" />,
};

export default function CategoryIcon({ slug, size = 24 }: { slug: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[slug] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}
