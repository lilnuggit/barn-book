import { SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { Download, LogOut, Share, SquarePlus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ActivityManager } from "@/components/settings/activity-manager";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { requireUserId } from "@/lib/auth";
import { countEntries, getActivityTypes } from "@/lib/data";
import { LOCAL_DEV_USER_ID } from "@/lib/dev-mode";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-xl space-y-8 px-4 pt-5">
        <Suspense fallback={<Skeleton className="h-[640px] rounded-2xl" />}>
          <Activities />
        </Suspense>

        <section>
          <SectionTitle>Your data</SectionTitle>
          <Card>
            <a
              href="/api/export"
              download
              className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-2"
            >
              <Download className="size-5 text-brand" />
              <span className="flex-1">
                <span className="block text-[16px] font-medium">Download everything (CSV)</span>
                <Suspense fallback={<span className="block h-5" />}>
                  <EntryCount />
                </Suspense>
              </span>
            </a>
          </Card>
        </section>

        <section className="[@media(display-mode:standalone)]:hidden">
          <SectionTitle>Put it on your iPhone</SectionTitle>
          <Card className="px-4 py-3.5 text-[15px] leading-relaxed">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Open this page in Safari.</li>
              <li>
                Tap Share <Share className="inline size-4 align-[-2px] text-brand" aria-label="(the Share icon)" />.
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>{" "}
                <SquarePlus className="inline size-4 align-[-2px] text-brand" aria-hidden />.
              </li>
            </ol>
            <p className="mt-2 text-ink-3">It opens full-screen like any other app.</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Account</SectionTitle>
          <Suspense fallback={<Skeleton className="h-16 rounded-2xl" />}>
            <Account />
          </Suspense>
        </section>
      </div>
    </>
  );
}

async function Activities() {
  const userId = await requireUserId();
  const activities = await getActivityTypes(userId);
  return <ActivityManager activities={activities} />;
}

async function EntryCount() {
  const userId = await requireUserId();
  const n = await countEntries(userId);
  return (
    <span className="block text-sm text-ink-3">
      {n} {n === 1 ? "entry" : "entries"} — opens in Numbers, Excel, or Google Sheets
    </span>
  );
}

async function Account() {
  await requireUserId();
  if (LOCAL_DEV_USER_ID) {
    return <Card className="px-4 py-3.5 text-[15px] text-ink-3">Local development mode — no sign-in.</Card>;
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.username ?? "Signed in";
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm text-ink-3">Signed in as</p>
        <p className="truncate text-[16px] font-medium">{email}</p>
      </div>
      <SignOutButton redirectUrl="/sign-in">
        <button type="button" className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-danger active:bg-danger-soft">
          <LogOut className="size-5" />
          <span className="text-[16px] font-medium">Sign out</span>
        </button>
      </SignOutButton>
    </Card>
  );
}
