import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";
import { ToastProvider } from "@/components/toast";

/**
 * Customers route providers — mirrors jobs/layout.tsx: auth (redirect to
 * login when signed out), react-query, and toasts live in route layouts,
 * not the root layout, so each screen stack carries its own.
 */
export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider redirectAuthenticated={false}>
      <QueryProvider>
        <ToastProvider>{children}</ToastProvider>
      </QueryProvider>
    </AuthProvider>
  );
}