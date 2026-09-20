import Link from "next/link";
import Page from "@/components/Page";
import { MIN_AGE } from "@/lib/config";

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I pay?",
    a: "By bank transfer. Place your order, transfer the total to the account shown at checkout, then add your transfer reference and a screenshot. We check the payment and email you a confirmation.",
  },
  {
    q: "How do I track my order?",
    a: "Open Your orders from your account. Each order shows where it is: placed, payment submitted, confirmed or shipped.",
  },
  {
    q: "Do I need an account to order?",
    a: "Yes. An account lets you place orders and follow them from payment to delivery.",
  },
  {
    q: `Why do you ask if I'm ${MIN_AGE} or older?`,
    a: "We sell to adults only, so we ask before you enter the site and again when you create an account.",
  },
  {
    q: "What does delivery cost?",
    a: "Delivery charges and times are set by the store and shown at checkout before you pay.",
  },
];

export default function SupportPage() {
  return (
    <Page narrow title="Support" lede="Quick answers. Can't find yours? Get in touch.">
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="cursor-pointer list-none text-lg font-medium marker:content-none hover:text-rasta-gold">
              {item.q}
            </summary>
            <p className="mt-3 max-w-[60ch] text-muted">{item.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-muted">
        Still stuck?{" "}
        <Link href="/contact" className="font-medium text-paper underline underline-offset-4">
          Contact us
        </Link>
      </p>
    </Page>
  );
}
