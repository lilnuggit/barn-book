"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { discard, usePendingWrites } from "@/lib/sync";
import { toast } from "../toast";

/** Only rendered when Clerk is active (not in local dev mode). */
export function SignOutRow() {
  const clerk = useClerk();
  const pending = usePendingWrites();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    const unsynced = pending.map((i) => i.id);
    if (
      unsynced.length > 0 &&
      !window.confirm(
        `${unsynced.length} ${unsynced.length === 1 ? "change hasn’t" : "changes haven’t"} synced yet and will be lost if you sign out. Sign out anyway?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await clerk.signOut({ redirectUrl: "/sign-in" });
      // Only once the sign-out went through, as the user chose above.
      discard(unsynced);
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast("Couldn’t sign out — check your connection and try again");
    }
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
