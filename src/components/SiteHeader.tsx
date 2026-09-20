import Link from "next/link";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function SiteHeader() {
  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          babajee
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-neutral-300">
              {item.label}
            </Link>
          ))}
          <Link href="/cart" className="hover:text-neutral-300">
            Cart
          </Link>
          <Link href="/account" className="hover:text-neutral-300">
            Account
          </Link>
        </nav>
      </div>
    </header>
  );
}
