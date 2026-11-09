import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { LOCAL_DEV_USER_ID } from "./dev-mode";

/**
 * Returns the signed-in user's id, or sends them to the sign-in page.
 * Every database read and write goes through this, and is scoped to that id.
 */
export const requireUserId = cache(async (): Promise<string> => {
  if (LOCAL_DEV_USER_ID) {
    await cookies(); // mark the render as request-time, same as Clerk would
    return LOCAL_DEV_USER_ID;
  }
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
});
