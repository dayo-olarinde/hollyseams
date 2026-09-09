import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "Hollyseams",
  description: "Tailor management for Wunmi",
};

/**
 * Inter — the Apple HIG typeface (the playbook's cross-platform SF
 * substitute), self-hosted by next/font. The Midnight Indigo theme's
 * Fraunces + Space Grotesk were removed: nothing renders that theme
 * anymore (preserved in git at b1fa5cc), and preloading ~11 font files
 * for it was pure bandwidth on every page load.
 */
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
      <body className={inter.variable}>
        {/* Providers live at the ROOT, not per route: one QueryClient + one
            session check per app load, so React Query's cache survives tab
            switches (instant revisits) and toasts persist across screens. */}
        <AuthProvider>
          <QueryProvider>
            <ToastProvider>{children}</ToastProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}