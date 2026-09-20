import Link from "next/link";
import Logo from "@/components/Logo";
import { Placeholder } from "@/components/Page";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-6xl flex-col justify-center px-5 py-16 sm:px-8">
      <Logo priority className="w-[min(88vw,34rem)]" />
      <p className="mt-8 max-w-[34ch] text-xl text-muted">
        Rolling papers, trays, glass, grinders and everything that goes with them.
      </p>
      <div className="mt-8">
        <Link href="/shop" className="btn btn-primary">
          Enter the shop
        </Link>
      </div>
      <div className="mt-16 max-w-md">
        <Placeholder>
          Temporary screen. The store entrance animation and the 360 view replace this once the
          artwork is ready.
        </Placeholder>
      </div>
    </div>
  );
}
