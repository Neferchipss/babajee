// Small interface marks complement the generated screenprint illustrations.
export default function DaydreamMark({ variant }: { variant: number }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {variant === 0 && <><path d="M3 32Q32 2 61 32Q32 60 3 32Z" fill="#faf6ec" /><circle cx="32" cy="32" r="14" fill="#f466af" /><circle cx="32" cy="32" r="6" fill="currentColor" /><path d="m14 20-4-6m22-2V5m19 15 4-6" /></>}
      {variant === 1 && <><circle cx="32" cy="31" r="18" fill="#f466af" /><ellipse cx="32" cy="32" rx="31" ry="8" transform="rotate(-28 32 32)" fill="#ffcf33" /><path d="M16 23a18 18 0 0 1 34 8" fill="#f466af" /><path d="m53 5 1 5 5 1-5 1-1 5-1-5-5-1 5-1Z" fill="#ffcf33" /></>}
      {variant === 2 && <><path d="m32 2 6 14 14-7-4 17 14 6-14 6 4 17-14-7-6 14-6-14-14 7 4-17-14-6 14-6-4-17 14 7Z" fill="#ffcf33" /><circle cx="32" cy="32" r="17" fill="#ffcf33" /><path d="M23 29h2m14 0h2m-16 9q7 7 14 0" /></>}
      {variant === 3 && <><path d="M25 20C8-2 0 23 18 29C-7 36 13 55 24 43C23 67 46 66 43 44C61 60 72 37 49 31C72 19 48 3 41 21C45-6 20-3 25 20Z" fill="#faf6ec" /><circle cx="33" cy="32" r="13" fill="#ffcf33" /><path d="M27 29h1m10 0h1m-12 8q6 5 12-1" /></>}
    </svg>
  );
}
