/**
 * Auth layout — used for login and other unauthenticated pages.
 * Centers content vertically and horizontally on mobile.
 * Wraps children with the AuthProvider for auth state management.
 */
import { AuthProvider } from "@/lib/auth-context";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <main className="flex min-h-dvh flex-col items-center justify-center p-8">
        {children}
      </main>
    </AuthProvider>
  );
}
