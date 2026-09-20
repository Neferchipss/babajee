type P = { size?: number; className?: string };

const svg = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className,
});

export const SearchIcon = ({ size = 22, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const UserIcon = ({ size = 22, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20c.8-4 3.7-6 7.5-6s6.7 2 7.5 6" />
  </svg>
);

export const CartIcon = ({ size = 22, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M3 4h2.5l2 11h10.5l2-8H7" />
    <circle cx="9.5" cy="19" r="1.3" />
    <circle cx="17" cy="19" r="1.3" />
  </svg>
);

export const LeafIcon = ({ size = 28, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z" />
    <path d="M5 19c3-4 6-7 10-9" />
  </svg>
);

export const SunIcon = ({ size = 28, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
  </svg>
);

export const GlobeIcon = ({ size = 28, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.4 3.6 5.2 3.6 8.5s-1 6.1-3.6 8.5c-2.6-2.4-3.6-5.2-3.6-8.5s1-6.1 3.6-8.5Z" />
  </svg>
);

export const HeartIcon = ({ size = 28, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
  </svg>
);
