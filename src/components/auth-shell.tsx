import type { ReactNode } from "react";
import { HorseshoeMark } from "./icons";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas pb-10">
      <div className="pt-safe bg-header">
        <div className="flex flex-col items-center gap-2 px-4 pt-10 pb-14 text-header-ink">
          <HorseshoeMark className="size-14" />
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Barn Book</h1>
          <p className="text-sm text-header-ink-2">Your horses’ daily training log</p>
        </div>
      </div>
      <div className="-mt-8 flex justify-center px-4">{children}</div>
    </main>
  );
}
