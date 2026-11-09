"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { HorseshoeMark } from "@/components/icons";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="pt-safe mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <HorseshoeMark className="size-14 text-brand" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        Your saved entries are safe. Changes you just made are kept on this phone and will sync.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-[16px] font-semibold text-brand-ink"
        >
          <RotateCcw className="size-4" /> Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-full px-5 text-[16px] font-semibold text-brand ring-1 ring-line"
        >
          Reload
        </button>
      </div>
    </main>
  );
}
