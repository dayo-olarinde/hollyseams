import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";
import { ToastProvider } from "@/components/toast";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider redirectAuthenticated={false}>
      <QueryProvider>
        <ToastProvider>{children}</ToastProvider>
      </QueryProvider>
    </AuthProvider>
  );
}