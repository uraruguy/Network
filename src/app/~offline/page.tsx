import { Logo } from "@/components/shell/Logo";

export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="app-bg" aria-hidden />
      <div className="glass specular rounded-[var(--r-xl)] p-8 text-center max-w-sm">
        <Logo size={48} />
        <h1 className="mt-4 text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-fg-2 text-[15px]">
          Pages you&apos;ve already opened still work. This one hasn&apos;t been cached yet — reconnect and try again.
        </p>
      </div>
    </main>
  );
}
