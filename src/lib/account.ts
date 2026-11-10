"use client";

/** Who is signed in on this phone, as Clerk's browser script sees it. */

export type ClerkSession = { getToken(options?: { skipCache?: boolean }): Promise<string | null> };
export type ClerkGlobal = {
  loaded?: boolean;
  status?: string;
  session?: ClerkSession | null;
  user?: { id: string } | null;
};

export function clerk(): ClerkGlobal | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
}

/** The root layout marks <html data-auth="clerk"> unless running locally without sign-in. */
export function usesClerk() {
  return typeof document !== "undefined" && document.documentElement.dataset.auth === "clerk";
}

/** The signed-in account: an id, null (no Clerk / signed out), or undefined (Clerk still loading). */
export function currentUser(): string | null | undefined {
  if (!usesClerk()) return null;
  const c = clerk();
  if (!c?.loaded) return undefined;
  return c.user?.id ?? null;
}
