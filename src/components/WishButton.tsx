"use client";

import { type MouseEvent, useState } from "react";
import { type SavedItem, toggleSaved, useIsSaved } from "@/lib/wishlist";

// The heart: tap to save a product for later, tap again to let it go. It
// pops when it fills.
export default function WishButton({ item, className = "" }: { item: SavedItem; className?: string }) {
  const saved = useIsSaved(item.slug);
  const [pop, setPop] = useState(0);
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const now = toggleSaved(item);
    if (now) setPop((n) => n + 1);
    try {
      navigator.vibrate?.(now ? [6, 30, 10] : 5);
    } catch {}
  };
  return (
    <button
      type="button"
      className={`wish ${className}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.name} from saved` : `Save ${item.name} for later`}
      onClick={onClick}
    >
      <svg key={pop} className="wish-heart" data-pop={pop > 0 && saved} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.3s-7.8-4.7-7.8-10.4A4.5 4.5 0 0 1 12 7.3a4.5 4.5 0 0 1 7.8 2.6c0 5.7-7.8 10.4-7.8 10.4Z" />
      </svg>
    </button>
  );
}
