import Image from "next/image";
import logo from "@/assets/logo.webp";
import outlined from "@/assets/logo-outlined.webp";

// The full lockup: wordmark, "the smoke shop" and the TM. Always used whole.
// Two renderings of the same logo: the plain one for dark backgrounds and an
// outlined one for light themes, where the yellow letters would disappear.
// The theme CSS decides which is shown. Size it with a width class.
// Both are 900px WebPs (enough for the big logo on a 2x screen); the outlined
// one loads lazily, so the dark themes, where it is hidden, never fetch it.
export default function Logo({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src={logo}
        alt="Babajee, the smoke shop"
        priority={priority}
        className={`logo-dark h-auto ${className}`}
      />
      <Image
        src={outlined}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={`logo-light h-auto ${className}`}
      />
    </>
  );
}
