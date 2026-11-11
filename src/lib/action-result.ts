/**
 * What every server action returns. Actions never redirect or throw for
 * expected problems, so the client can react: an expired sign-in is renewed
 * and the write retried; bad input shows a message.
 */
export type ActionResult =
  /** userId: the account it was saved to (missing from versions of the server before visits). */
  | { ok: true; userId?: string }
  | { ok: false; reason: "signed-out" }
  | { ok: false; reason: "invalid"; error: string };

/**
 * Client-side outcome.
 * - "failed": not confirmed yet (kept on the phone and retried, if stored).
 * - "replaced": a newer change to the same thing took its place before it was
 *   sent; that one reports what happened, so there's nothing to say here.
 */
export type SyncResult = ActionResult | { ok: false; reason: "failed" } | { ok: false; reason: "replaced" };
