import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { LOCAL_DEV_USER_ID } from "@/lib/dev-mode";

// Clerk needs its middleware running so auth() works. The actual access checks
// happen next to the data: every page, server action, and API route checks the
// signed-in user and only ever reads or writes that user's rows.
export default LOCAL_DEV_USER_ID
  ? () => NextResponse.next()
  : clerkMiddleware({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    // Skip Next.js internals and static files (icons, manifest)
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
