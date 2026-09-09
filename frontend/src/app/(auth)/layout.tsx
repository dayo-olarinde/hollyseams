/**
 * Auth layout — used for login and other unauthenticated pages.
 *
 * Apple HIG scoped (see globals.css `.hig`): iOS system background via
 * --hig-bg (white light / black dark), 20px side margins (8pt grid),
 * content centered vertically. Providers live at the root layout.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="hig flex min-h-dvh flex-col items-center justify-center bg-[var(--hig-bg)] p-5 text-[var(--hig-label)] transition-colors duration-200">
      {children}
    </main>
  );
}