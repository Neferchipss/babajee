import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import AgeGate from "@/components/AgeGate";
import MediaGuard from "@/components/MediaGuard";
import SiteFooter from "@/components/SiteFooter";
import SiteFrame from "@/components/SiteFrame";
import SiteHeader from "@/components/SiteHeader";
import { AuthProvider } from "@/lib/auth";
import { AGE_STORAGE_KEY } from "@/lib/config";
import { modeBootScript } from "@/lib/mode-boot";
import { DEFAULT_THEME, SHOWN_THEMES, THEME_STORAGE_KEY } from "@/lib/themes";
import "./globals.css";
import "./themes/base.css";
import "./themes/refined.css";
import "./themes/daydream.css";
import "./themes/daydream-category.css";
import "./themes/baba-eyes.css";
import "./themes/baba.css";
import "./themes/baba-night.css";
import "./themes/baba-poster.css";
import "./themes/modes.css";
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

// Edge to edge on phones with a notch or Dynamic Island: the page draws
// under them and every fixed or edge-hugging piece keeps clear with the
// safe-area insets (env(safe-area-inset-*)). The theme colour tints the
// browser's own bars to match the night shop, so they read as one surface.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0a1c",
};

// Runs before first paint: restores the age answer, the chosen shop theme and
// light or dark, so returning visitors never see a flash of the gate or the
// wrong look.
const bootScript = `try{
if(localStorage.getItem(${JSON.stringify(AGE_STORAGE_KEY)})==="1")document.documentElement.dataset.ageOk="1";
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(${JSON.stringify(SHOWN_THEMES.map((x) => x.id))}.indexOf(t)>-1)document.documentElement.dataset.theme=t;
${modeBootScript}
}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${themeFontVars}`}
      data-theme={DEFAULT_THEME}
      data-mode="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <AuthProvider>
          <AgeGate />
          <MediaGuard />
          <SiteFrame>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </SiteFrame>
        </AuthProvider>
      </body>
    </html>
  );
}
