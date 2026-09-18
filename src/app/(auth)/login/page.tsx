import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/shell/Logo";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <div className="app-bg" aria-hidden />
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size={56} />
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">The Network</h1>
            <p className="mt-1 text-[15px] text-fg-2">Your people, on a globe.</p>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
