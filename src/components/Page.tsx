import Link from "next/link";
import type { ReactNode } from "react";

type PageProps = {
  title: ReactNode;
  lede?: ReactNode;
  back?: { href: string; label: string };
  narrow?: boolean;
  children?: ReactNode;
};

export default function Page({ title, lede, back, narrow = false, children }: PageProps) {
  return (
    <div
      className={`mx-auto w-full px-5 py-14 sm:px-8 sm:py-20 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}
    >
      <header className="mb-12 sm:mb-14">
        {back && (
          <Link
            href={back.href}
            className="mb-4 block text-sm text-muted transition-colors hover:text-paper"
          >
            {back.label}
          </Link>
        )}
        <h1 className="text-4xl sm:text-5xl">{title}</h1>
        {lede && <p className="mt-4 max-w-[60ch] text-lg text-muted">{lede}</p>}
      </header>
      {children}
    </div>
  );
}

export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
      {children}
    </p>
  );
}
