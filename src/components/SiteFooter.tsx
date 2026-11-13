import Link from "next/link";
import { MIN_AGE } from "@/lib/config";
import Logo from "./Logo";
import "./site-footer.css";

// The footer: the brand and a line about the shop, then three short columns
// of links under small headings, and a closing line. Every look shares it;
// each colours it from its own tokens (Daydream adds its landscape above).
const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "All products" },
      { href: "/shop/rolling-paper", label: "Rolling papers" },
      { href: "/shop/rolling-tray", label: "Rolling trays" },
      { href: "/shop/grinder", label: "Grinders" },
      { href: "/shop/bong", label: "Bongs" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/account", label: "Account" },
      { href: "/orders", label: "Your orders" },
      { href: "/cart", label: "Your cart" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/support", label: "Support" },
      { href: "/contact", label: "Contact" },
      { href: "/about", label: "About Babajee" },
      { href: "/terms", label: "Terms" },
      { href: "/legal", label: "Legal and privacy" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="ftr-inner">
        <div className="ftr-brand">
          <Logo className="ftr-logo-img" />
          <p className="ftr-blurb">Papers, trays, glass and everything that goes with them, delivered across India.</p>
        </div>
        <nav aria-label="Footer" className="ftr-cols">
          {COLUMNS.map((c) => (
            <div key={c.title} className="ftr-col">
              <h2 className="ftr-h">{c.title}</h2>
              <ul>
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="ftr-bottom">
        <p>© {new Date().getFullYear()} Babajee</p>
        <p className="ftr-note">For adults only. You must be {MIN_AGE} or older to use this site.</p>
      </div>
    </footer>
  );
}
