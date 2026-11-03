import Image from "next/image";
import logo from "@/assets/logo.webp";

// The drip logo: white "baBa jeE" on a black paint blob. It carries its own
// black ground, so the same file works on light and dark themes. Nearly
// square (900 x 932), so size it with a width class and expect about the
// same height. Source: brand/logo-drip-source.png (cleaned ChatGPT redraw of
// brand/logo-drip-reference.png).
export default function Logo({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return <Image src={logo} alt="Babajee" priority={priority} className={`logo-mark h-auto ${className}`} />;
}
