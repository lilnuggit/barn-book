import { Suspense, type ReactNode } from "react";
import { HorseshoeMark } from "./icons";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas pb-10">
      <div className="pt-safe bg-header">
        <div className="flex flex-col items-center gap-2 px-4 pt-10 pb-14 text-header-ink">
          <HorseshoeMark className="size-14" />
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Barn Book</h1>
          <p className="text-sm text-header-ink-2">Your horses’ daily training log</p>
          <p className="mt-2 hidden rounded-full bg-header-fill px-3 py-1 text-xs text-header-ink [@media(display-mode:standalone)]:block">
            Sign in with your email — you’ll get a code
          </p>
        </div>
      </div>
      <div className="-mt-8 flex justify-center px-4">
        {/* Clerk's forms read the URL, which is only known at request time. */}
        <Suspense
          fallback={
            <div className="h-[420px] w-full max-w-[400px] animate-pulse rounded-2xl bg-surface shadow-card ring-1 ring-line" />
          }
        >
          {children}
        </Suspense>
      </div>
    </main>
  );
}
