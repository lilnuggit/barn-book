import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { cache } from "react";
import { LOCAL_DEV_USER_ID } from "./dev-mode";

/** The signed-in user's id, or null. Used by server actions, which must not redirect. */
export const getUserIdOrNull = cache(async (): Promise<string | null> => {
  if (LOCAL_DEV_USER_ID) {
    await cookies(); // mark the render as request-time, same as Clerk would
    return LOCAL_DEV_USER_ID;
  }
  const { userId } = await auth();
  return userId;
});

/**
 * For pages and route handlers: the signed-in user's id, or a redirect to the
 * sign-in page that comes back here afterwards. Every read is scoped to this id.
 */
export const requireUserId = cache(async (): Promise<string> => {
  if (LOCAL_DEV_USER_ID) return getUserIdOrNull() as Promise<string>;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  return userId;
});
