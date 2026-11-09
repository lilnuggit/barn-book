// Runs before every build so a missing setting fails with a clear message
// instead of a confusing error halfway through.
const missing = [];

if (!process.env.DATABASE_URL) {
  missing.push(
    "DATABASE_URL: connect a Neon database to this project (Vercel: Storage -> Create Database -> Neon).",
  );
}

const onVercel = Boolean(process.env.VERCEL);
if (onVercel || !process.env.LOCAL_DEV_USER_ID) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    missing.push(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY: add Clerk to this project (Vercel: Integrations -> Clerk), or paste the keys from clerk.com.",
    );
  }
}

if (missing.length) {
  console.error("\nBarn Book can't build yet. Missing settings:\n");
  for (const m of missing) console.error(`  - ${m}`);
  console.error("\nAdd them, then redeploy.\n");
  process.exit(1);
}
