import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider, SessionWatcher } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-provider";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Hollyseams",
  description: "Tailor management for Wunmi",
  manifest: "/manifest.webmanifest",
  // The app is a phone tool; installing it should not show browser chrome.
  appleWebApp: { capable: true, title: "HollySeams", statusBarStyle: "default" },
};

/**
 * `viewportFit: "cover"` is the difference between a website and a phone app.
 *
 * By default iOS letterboxes the page inside the safe area, so the status bar and the home
 * indicator get an opaque strip of browser chrome. With `cover`, the page may paint edge to edge —
 * which only looks right if the app then respects the insets itself, which is what the
 * `safe-top` / `tabbar-safe` / `fab-safe` / `content-safe` utilities in `globals.css` exist for.
 * The payoff is the iOS look the design is aiming at: the translucent header blending under the
 * notch, the tab bar's blur reaching the bottom of the screen, nothing looking padded-in.
 *
 * Note what is deliberately absent: `maximumScale: 1`. Pinning the zoom level is a common habit in
 * mobile-first apps and it is an accessibility regression — it takes away the only way a
 * low-vision user has to enlarge a price. The typography does not need it: interactive rows are at
 * least 44px tall and body copy is 13px and up.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/**
 * Paint the right theme before the first frame.
 *
 * This has to run before React: the theme is a class on `<html>`, and doing it in an effect would
 * mean the first paint is always wrong and the user sees it flip. Reading `localStorage` and
 * falling back to the system preference is the whole job — which is why there is no theme library
 * here. It is a synchronous inline script, and `suppressHydrationWarning` on `<html>` tells React
 * the class was set by something other than itself.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('hig-theme');if(t!=='hig-light'&&t!=='hig-dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'hig-dark':'hig-light';}document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add('hig-light');}})();`;

/**
 * Inter, self-hosted.
 *
 * Was `next/font/google`, which fetches from Google at *build* time — and one flaky-network day
 * that fails the whole build (`Failed to fetch Inter`). The file is the variable-weight latin
 * subset, downloaded once into `src/fonts`; builds are now network-independent, the font still
 * ships self-hosted (no third-party request at runtime), and `display: "swap"` keeps the first
 * paint on the system stack while it loads.
 */
const inter = localFont({
  src: "../fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={inter.variable}>
        {/*
          Order matters now: `AuthProvider` reads the query cache (the session *is* a query), so it
          has to sit inside the client — the old layout had them the other way round, which is why
          the session could never be part of the cache.
        */}
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              {/* Navigation on an expired session, decided once instead of by every screen. */}
              <SessionWatcher />
              {children}
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
