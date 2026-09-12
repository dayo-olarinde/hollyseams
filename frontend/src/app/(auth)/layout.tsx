export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="hig flex min-h-dvh flex-col items-center justify-center bg-(--hig-bg) p-5 text-(--hig-label) transition-colors duration-200">
      {children}
    </main>
  );
}