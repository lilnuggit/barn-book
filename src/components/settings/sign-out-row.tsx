"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { clearOutbox, usePendingWrites } from "@/lib/sync";

/** Only rendered when Clerk is active (not in local dev mode). */
export function SignOutRow() {
  const clerk = useClerk();
  const pending = usePendingWrites();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (
      pending.length > 0 &&
      !window.confirm(
        `${pending.length} ${pending.length === 1 ? "change hasn’t" : "changes haven’t"} synced yet and will be lost if you sign out. Sign out anyway?`,
      )
    ) {
      return;
    }
    setBusy(true);
    // Changes saved on this phone belong to this account only.
    clearOutbox();
    await clerk.signOut({ redirectUrl: "/sign-in" });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="flex min-h-11 w-full items-center gap-3 px-4 py-3.5 text-left text-danger active:bg-danger-soft disabled:opacity-60"
    >
      <LogOut className="size-5" />
      <span className="text-[16px] font-medium">{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
