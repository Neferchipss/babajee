import Link from "next/link";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/support", label: "Support" },
  { href: "/terms", label: "T&C" },
  { href: "/legal", label: "Legal" },
];

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-neutral-800">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-neutral-500">
        <span>&copy; {new Date().getFullYear()} babajee</span>
        <nav className="flex flex-wrap gap-4">
          {LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-neutral-300">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
