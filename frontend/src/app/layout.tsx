import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hollyseams",
  description: "Tailor management for Wunmi",
};

/**
 * Design system typefaces (Midnight Indigo):
 * - Fraunces — display serif, used via `font-heading` (italic accents)
 * - Space Grotesk — body/UI, used via `font-body`
 * The CSS variables are consumed by the @theme tokens in globals.css.
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${fraunces.variable}`}>
        {children}
      </body>
    </html>
  );
}