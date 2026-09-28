"use client";

import { useEffect, useRef, useState } from "react";
import { publicAsset, useShopTheme } from "@/lib/useShopTheme";

// A flower beside the shelf that blooms as you browse. Its video (a sleepy
// bud opening into a smiling flower) is never played; the playhead follows
// how far down the shelf you have scrolled, eased so it unfurls smoothly.
export default function DaydreamBloom() {
  const theme = useShopTheme();
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const v = video.current;
    const shelf = v?.closest(".cp-body");
    if (!v || !shelf) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target = 0;
    let current = 0;
    let frame = 0;

    const measure = () => {
      const r = shelf.getBoundingClientRect();
      // 0 when the shelf top reaches the header, 1 when its end is in view
      const travel = r.height - window.innerHeight * 0.6;
      target = Math.min(1, Math.max(0, (window.innerHeight * 0.25 - r.top) / Math.max(travel, 1)));
      if (still) show(target);
    };
    const show = (t: number) => {
      const d = v.duration;
      if (d) v.currentTime = t * (d - 0.05);
      setOpen(t > 0.97);
    };
    const tick = () => {
      current += (target - current) * 0.1;
      if (Math.abs(target - current) > 0.001) show(current);
      frame = requestAnimationFrame(tick);
    };

    const first = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    if (!still) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [theme]);

  if (theme !== "daydream") return null;
  return (
    <aside className="dd-bloom" aria-hidden="true">
      <div className="dd-bloom-inner">
        <video
          ref={video}
          src={publicAsset("/daydream/bloom.mp4")}
          poster={publicAsset("/daydream/bloom.webp")}
          muted
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload"
          preload="auto"
          tabIndex={-1}
        />
        <p className="dd-bloom-note">{open ? "Fully awake ✦" : "Keep browsing. Something’s waking up."}</p>
      </div>
    </aside>
  );
}
