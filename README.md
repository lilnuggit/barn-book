# Barn Book

A daily training log for horses, made to live on an iPhone home screen.

Each day you build a list of horses and what they're doing (hack, GW, dressage,
trot sets, lessons, XC…). As the day goes on you check them off and jot a quick
note. Nothing gets deleted, so you can look back at what any horse did and when.

- **Today**: the day's checklist. Tap the circle to check a horse off; the card
  opens so you can add a note. Mark a horse skipped (lost a shoe, etc.), change
  the work, or remove it. ‹ › move between days, so you can plan tomorrow tonight.
  An empty day offers to repeat yesterday's list or the same day last week.
- **Horses**: every horse with what it did last and how often. Each horse has a
  six-week calendar, when it last did each type of work, its full history, and
  an "About" box for feed, shoeing, and so on.
- **History**: a month calendar with every day's notes below it, plus search
  across notes, horse names, and types of work.
- **Settings**: add, rename, recolor, reorder, or archive types of work.
  Download everything as a spreadsheet (CSV).

Losing signal at the barn is fine: changes show up straight away and are saved
when the connection comes back, as long as the app stays open in the meantime.

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · Tailwind CSS 4 ·
Drizzle ORM · Neon Postgres · Clerk auth · Vercel

## Deploying (Vercel + Neon + Clerk)

1. Create a Vercel project from this code (import the GitHub repo, or `vercel deploy`).
2. In the project on Vercel, open **Storage → Create Database → Neon**, and connect
   it to the project. This sets `DATABASE_URL`.
3. Add **Clerk** from the Vercel Marketplace and connect it to the project (or create
   an app at clerk.com and add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
   `CLERK_SECRET_KEY` as environment variables).
4. Redeploy. The build creates the database tables (`drizzle-kit migrate`) before
   `next build`.
5. Under **Settings → Deployment Protection**, make sure Vercel Authentication doesn't
   cover the production domain. The app has its own sign-in.
6. Open the site in Safari on your iPhone, create your account, then
   **Share → Add to Home Screen**.

Tip: inside the home-screen app, sign in with email (code or password). "Continue
with Google" bounces out to Safari on iOS and the app won't see the sign-in.
Once your account exists, you can switch Clerk to *Restricted* sign-ups so no one
else can create one. Data is always private to each account anyway.

## Local development

Needs Node 20+ and a Postgres database.

```bash
cp .env.example .env.local   # fill in DATABASE_URL
npm install
npm run db:migrate
npm run dev
```

To skip Clerk locally, add `LOCAL_DEV_USER_ID=local-dev-user` to `.env.local`.
This is ignored on Vercel, where sign-in is always required.

Changing the schema: edit `src/db/schema.ts`, run `npm run db:generate`, and
commit the new file in `drizzle/`.

## Where things live

| Path | What |
| --- | --- |
| `src/app/(app)/page.tsx` | Today (and any other day via `?d=YYYY-MM-DD`) |
| `src/app/(app)/horses/` | Horse list and horse detail |
| `src/app/(app)/history/` | Month calendar, log, search |
| `src/app/(app)/settings/` | Types of work, export, account |
| `src/app/actions.ts` | All writes (server actions), each scoped to the signed-in user |
| `src/lib/data.ts` | All reads |
| `src/db/schema.ts` | Tables: `horses`, `activity_types`, `entries` |
| `src/app/api/export/route.ts` | CSV download |
