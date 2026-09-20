import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import AgeGate from "@/components/AgeGate";
import SiteFooter from "@/components/SiteFooter";
import SiteFrame from "@/components/SiteFrame";
import SiteHeader from "@/components/SiteHeader";
import { AGE_STORAGE_KEY } from "@/lib/config";
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from "@/lib/themes";
import "./globals.css";
import "./themes/base.css";
import "./themes/sunshine.css";
import "./themes/fieldnotes.css";
import "./themes/trailhead.css";
import "./themes/refined.css";
import "./themes/groove.css";
import { themeFontVars } from "./themes/fonts";

// One geometric family for everything outside the shop themes.
const body = Outfit({
  subsets: ["latin"],
  variable: "--font-body-face",
});

export const metadata: Metadata = {
  title: "Babajee",
  description: "Smoking accessories: rolling papers, trays, glass, grinders and more.",
};

// Runs before first paint: restores the age answer and the chosen shop theme,
// so returning visitors never see a flash of the gate or the wrong look.
const bootScript = `try{
if(localStorage.getItem(${JSON.stringify(AGE_STORAGE_KEY)})==="1")document.documentElement.dataset.ageOk="1";
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(${JSON.stringify(THEMES.map((x) => x.id))}.indexOf(t)>-1)document.documentElement.dataset.theme=t;
}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${themeFontVars}`}
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <AgeGate />
        <SiteFrame>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </SiteFrame>
      </body>
    </html>
  );
}
