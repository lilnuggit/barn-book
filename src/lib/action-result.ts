/**
 * What every server action returns. Actions never redirect or throw for
 * expected problems, so the client can react: an expired sign-in is renewed
 * and the write retried; bad input shows a message.
 */
export type ActionResult =
  | { ok: true }
  | { ok: false; reason: "signed-out" }
  | { ok: false; reason: "invalid"; error: string };

/** Client-side outcome. "failed": not confirmed yet (kept on the phone and retried, if stored). */
export type SyncResult = ActionResult | { ok: false; reason: "failed" };
