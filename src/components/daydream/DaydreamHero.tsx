"use client";

import { publicAsset, useShopTheme } from "@/lib/useShopTheme";

// Daydream's category banner is a living screenprint poster: a generated
// looping clip of the valley (river running, daisy waking, stars pulsing).
// The title sits in the poster's open sky, so the art is the page.
export default function DaydreamHero() {
  const theme = useShopTheme();
  if (theme !== "daydream") return null;
  return (
    <video
      className="dd-poster"
      src={publicAsset("/daydream/valley.mp4")}
      poster={publicAsset("/daydream/valley.webp")}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload"
      aria-hidden="true"
    />
  );
}
