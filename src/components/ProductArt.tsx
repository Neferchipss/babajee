// Temporary product image: a large, light initial on a soft stone plate. The
// plate is the colour real photos will sit on, so mismatched supplier shots
// look consistent inside the dark UI.
export default function ProductArt({
  name,
  tone,
  className = "",
}: {
  name: string;
  tone: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className={`pa relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-plate [container-type:inline-size] ${className}`}
    >
      <span className="pa-initial text-[44cqw] font-extralight leading-none text-[color:var(--plate-ink,#cdc7b7)]">
        {initial}
      </span>
      <span className="pa-tone absolute inset-x-0 bottom-0 h-[3px]" style={{ background: tone }} />
    </div>
  );
}
