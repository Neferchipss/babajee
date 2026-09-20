import Link from "next/link";
import { MIN_AGE } from "@/lib/config";
import Logo from "./Logo";

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/support", label: "Support" },
  { href: "/terms", label: "Terms and conditions" },
  { href: "/legal", label: "Legal" },
];

export default function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="ftr-inner">
        <div className="ftr-brand">
          <Logo className="ftr-logo-img" />
          <p className="ftr-note">For adults only. You must be {MIN_AGE} or older to use this site.</p>
        </div>
        <nav aria-label="Footer" className="ftr-nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
