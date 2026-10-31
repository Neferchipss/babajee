"use client";

import { usePathname } from "next/navigation";
import SceneLink from "./SceneLink";
import { enterShop } from "./scene-note";
import "./store-button.css";

// Back into the 3D shop (inside it, not out on the street), floating in the bottom corner of the shelves (the
// thumb's corner on phones, where the cart used to float before it moved
// into the bar). Out of the way while a sheet is open over the shelf.
export default function StoreButton() {
  const path = usePathname().replace(/\/$/, "") || "/";
  if (!(path === "/shop" || path.startsWith("/shop/"))) return null;
  return (
    <SceneLink
      href="/"
      className="store-btn"
      aria-label="Back to the 3D shop"
      // straight back inside, stepping back out of this category's shelf
      onClick={() => enterShop(path.startsWith("/shop/") ? path.split("/")[2] : undefined)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9l1.2-5h13.6L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 2 3s2-1.3 2-3c0 1.7 1.3 3 3 3s3-1.3 3-3M10 20v-5h4v5" />
      </svg>
      <span>Back to shop</span>
    </SceneLink>
  );
}
