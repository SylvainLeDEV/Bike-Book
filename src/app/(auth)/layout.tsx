export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <p className="text-lg font-semibold tracking-tight">Bike-Book</p>
      {children}
    </main>
  );
}
