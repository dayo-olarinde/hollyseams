import type { Metadata } from "next";
import { Fraunces, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hollyseams",
  description: "Tailor management for Wunmi",
};

/**
 * Design system typefaces:
 * - Fraunces + Space Grotesk — Midnight Indigo theme (used via `font-heading`/`font-body`)
 * - Inter — the Apple HIG theme (`.hig`), the playbook's cross-platform SF substitute;
 *   self-hosted by next/font so every device renders the same premium weight
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Applies the saved theme class to <html> BEFORE first paint so there is no
 * light/dark flash: reads localStorage("hig-theme"), falls back to the OS
 * preference, and lands on either `hig-light` or `hig-dark`. The ThemeToggle
 * component updates both this class and localStorage.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('hig-theme');if(t!=='hig-light'&&t!=='hig-dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'hig-dark':'hig-light';}document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add('hig-light');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* suppressHydrationWarning: the theme script above adds hig-light/hig-dark
       to <html> before React hydrates, so the className legitimately differs. */
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`${spaceGrotesk.variable} ${fraunces.variable} ${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}