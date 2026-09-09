/**
 * Auth layout — used for login and other unauthenticated pages.
 *
 * Scoped to the Apple HIG theme experiment (see globals.css `.hig`):
 * - System font stack (SF on Apple devices, Segoe UI/Roboto elsewhere)
 * - iOS system backgrounds via --hig-* variables (white light / black dark)
 * - 20px side margins (8pt grid), content centered vertically
 *
 * The Midnight Indigo design system (dashboard) is untouched — this scope
 * applies only to auth screens.
 */
import { AuthProvider } from "@/lib/auth-context";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <main className="hig flex min-h-dvh flex-col items-center justify-center bg-[var(--hig-bg)] p-5 text-[var(--hig-label)] transition-colors duration-200">
        {children}
      </main>
    </AuthProvider>
  );
}