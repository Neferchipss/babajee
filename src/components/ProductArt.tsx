import { photosFor } from "@/lib/product-photos";
import { slugify } from "@/lib/slug";

// A product's picture: its first photo when there is one, otherwise a large,
// light initial on a soft stone plate. The plate is the colour photos sit on,
// so mismatched supplier shots look consistent inside the dark UI.
export default function ProductArt({
  name,
  tone,
  slug,
  option,
  className = "",
}: {
  name: string;
  tone: string;
  slug?: string;
  // the option (colour, design) whose photo to show, where options have their own
  option?: string;
  className?: string;
}) {
  const photo = photosFor(slug ?? slugify(name), option)[0];
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      style={{ "--tone": tone } as React.CSSProperties}
      className={`pa relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-plate [container-type:inline-size] ${className}`}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="pc-photo absolute inset-0 h-full w-full object-cover" loading="lazy" draggable={false} />
      ) : (
        <span className="pa-initial text-[44cqw] font-extralight leading-none text-[color:var(--plate-ink,#cdc7b7)]">
          {initial}
        </span>
      )}
      <span className="pa-tone absolute inset-x-0 bottom-0 h-[3px]" style={{ background: tone }} />
    </div>
  );
}
