/**
 * Local development without Clerk keys: set LOCAL_DEV_USER_ID in .env.local.
 * Never honored on Vercel (VERCEL is always set there), so a deployed app
 * always requires a real sign-in.
 */
export const LOCAL_DEV_USER_ID: string | null =
  process.env.LOCAL_DEV_USER_ID && !process.env.VERCEL ? process.env.LOCAL_DEV_USER_ID : null;
