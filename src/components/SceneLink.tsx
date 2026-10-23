"use client";

import Link from "next/link";
import { type ComponentProps, useState } from "react";

// A link into the 3D shop ("/" or "/shop"). Next.js prefetches every link as
// it comes into view, and for these that means three.js and the scene, about
// 160 KB, fetched on every page whether or not anyone goes there. This one
// waits until the link is pointed at, touched or focused, which is still
// ahead of the click.
export default function SceneLink({ onPointerEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [warm, setWarm] = useState(false);
  return (
    <Link
      {...props}
      prefetch={warm ? null : false}
      onPointerEnter={(e) => {
        setWarm(true);
        onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        setWarm(true);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setWarm(true);
        onFocus?.(e);
      }}
    />
  );
}

// Use SceneLink for the scene's own paths and a plain Link for the rest.
export const isScenePath = (href: string) => href === "/" || href === "/shop";
