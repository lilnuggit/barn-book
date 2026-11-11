# Barn Book

A daily training log for horses, made to live on an iPhone home screen.

Each day you build a list of horses and what they're doing (hack, GW, dressage,
trot sets, lessons, XC…). As the day goes on you check them off and jot a quick
note. Nothing gets deleted, so you can look back at what any horse did and when.

- **Today**: the day's checklist. Tap the circle to check a horse off; the card
  opens so you can add a note, and when you close it (or check the next horse)
  the horse moves to the bottom, so the ones still to do stay at the top. Mark a
  horse skipped (lost a shoe, etc.), change the work, or remove it. ‹ › move
  between days, so you can plan tomorrow tonight. An empty day offers to repeat
  yesterday's list or the same day last week.
- **Horses**: every horse with what it did last and how often. Each horse has a
  six-week calendar, its last and next visit of each type, when it last did
  each type of work, its full history, and an "About" box for feed, shoeing,
  and so on.
- **Visits**: the farrier, vet, dentist, PEMF, bodywork, chiro and any others
  you add. Book one for one horse or several, on a day and optionally at a
  time, with a note; check it off once it's happened. Give a type a reminder
  (the farrier every 6 weeks, the dentist every year) and Visits shows which
  horses are due or overdue, counted from each horse's last visit, with one
  tap to book them. Past visits not checked off are asked about ("Did these
  happen?"). A day's visits also show on Today, above the horses, where
  checking one off offers to book the next one.
- **History**: a month calendar with every day's notes below it, plus search
  across notes, horse names, and types of work.
- **Settings**: add, rename, recolor, reorder, or archive types of work, and
  types of visit and their reminders. Download the training log, every horse
  with its About notes, or every visit, as CSV.

Losing signal at the barn is fine: every change (check-offs, notes, horses, types
of work) is saved on the phone first and sent when there's a connection, in the
order it was made, even if iOS closes the app in between. A strip above the tabs
says when there's no signal (also on Wi-Fi with no internet) or when changes are
still waiting, and lines not saved yet say so. With no signal you can still
switch tabs: Today comes back with its list (the phone keeps a copy of the days
around today, with your changes in it, and uses it when the signal is gone or
the connection hangs), and Visits keeps its own copy too, so you can see who's
due and book at the barn; other screens if you've looked at them since your last
change was saved; the rest fill in once the signal returns (if one can't, the
app offers a reload). History and a horse's page say when changes on the phone
aren't in them yet. "Repeat yesterday's list" works with no signal too: the
lines appear at once and can be checked off straight away, and renamed horses
and types of work show their new names at once. When the live list comes back,
an open sheet, its picks and a note being typed carry on where they were. Other
days need signal; the day arrows say so. An app left open overnight knows it's a new day and loads today's list as
soon as it can. (The app does need signal to open from scratch.)

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
| `src/app/(app)/visits/` | Visits: to check off, due, coming up, done |
| `src/app/(app)/history/` | Month calendar, log, search |
| `src/app/(app)/settings/` | Types of work and of visit, export, account |
| `src/app/actions.ts` | All writes (server actions), each scoped to the signed-in user; they return a result instead of redirecting |
| `src/lib/sync.ts` | Client save queue: stores changes on the phone, sends them in order, renews the Clerk token, retries |
| `src/lib/data.ts` | All reads |
| `src/lib/appointments.ts` | Visits: due dates, reminders and the words for them (pure, tested with `npm test`) |
| `src/db/schema.ts` | Tables: `horses`, `activity_types`, `entries`, `appointment_types`, `appointments`, `appointment_horses` |
| `src/app/api/export/route.ts` | CSV download |
