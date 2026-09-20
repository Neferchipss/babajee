import Image from "next/image";
import logo from "@/assets/logo.png";
import outlined from "@/assets/logo-outlined.png";

// The full lockup: wordmark, "the smoke shop" and the TM. Always used whole.
// Two renderings of the same logo: the plain one for dark backgrounds and an
// outlined one for light themes, where the yellow letters would disappear.
// The theme CSS decides which is shown. Size it with a width class.
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
        priority={priority}
        className={`logo-light h-auto ${className}`}
      />
    </>
  );
}
