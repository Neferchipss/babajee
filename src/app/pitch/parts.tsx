"use client";

import { useState } from "react";
import s from "./pitch.module.css";

type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const SearchIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const BagIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </svg>
);

export const CartIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 4h2.5l2 11h10.5l2-8H7" />
    <circle cx="9.5" cy="19" r="1.3" />
    <circle cx="17" cy="19" r="1.3" />
  </svg>
);

export const ArrowIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);

export const CaretIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const InstagramIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="3.8" />
    <circle cx="17.2" cy="6.8" r=".6" fill="currentColor" />
  </svg>
);

export const TikTokIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M14 4v10.2a3.4 3.4 0 1 1-3.4-3.4" />
    <path d="M14 4c.4 2.4 1.9 3.8 4.5 4" />
  </svg>
);

export const YouTubeIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="6" width="18" height="12" rx="4" />
    <path d="m10.5 9.5 4 2.5-4 2.5Z" fill="currentColor" />
  </svg>
);

export const CrownIcon = ({ size = 28, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8Z" />
  </svg>
);

export function Heart({ label }: { label: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className={s.heart}
      aria-pressed={on}
      aria-label={`Save ${label}`}
      onClick={() => setOn((v) => !v)}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
      </svg>
    </button>
  );
}

// The brand's three colours as a short bar. Order differs per style.
export function TriBar({
  colors,
  className = "",
  height = 3,
}: {
  colors: [string, string, string];
  className?: string;
  height?: number;
}) {
  return (
    <i
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        height,
        borderRadius: 2,
        background: `linear-gradient(90deg, ${colors[0]} 0 33.3%, ${colors[1]} 33.3% 66.6%, ${colors[2]} 66.6%)`,
      }}
    />
  );
}

// Palm silhouette. Fronds are one leaf shape rotated about the crown.
const FROND = "M0 0C22-30 66-44 108-20C70-30 32-16 0 0Z";
const ANGLES: [number, number][] = [
  [-172, 0.85],
  [-148, 1],
  [-122, 0.95],
  [-92, 0.8],
  [-62, 0.95],
  [-34, 1],
  [-8, 0.9],
  [16, 0.8],
  [162, 0.75],
];

export function Palm({ className, fill = "#000" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 220 300" className={className} fill={fill} aria-hidden="true" preserveAspectRatio="xMidYMax meet">
      <path d="M100 300C96 220 108 150 104 84L112 84C116 150 104 220 112 300Z" />
      <g transform="translate(108 84)">
        {ANGLES.map(([deg, sc]) => (
          <path key={deg} d={FROND} transform={`rotate(${deg}) scale(${sc})`} />
        ))}
      </g>
    </svg>
  );
}

export function Mountain({ className, fill = "#000" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 600 140" className={className} fill={fill} aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 140V96L60 66l38 22 62-56 54 46 40-22 70 62 60-40 70 44 64-38 82 60v0H0Z" />
      <path d="M0 140V110l90-28 60 24 90-40 70 46 80-30 90 40 120-34v52H0Z" opacity=".85" />
    </svg>
  );
}
