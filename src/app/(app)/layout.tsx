import type { ReactNode } from "react";
import { AppLifecycle } from "@/components/app-lifecycle";
import { TabBar } from "@/components/tab-bar";
import { Toaster } from "@/components/toast";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Keeps the status bar readable once the green header scrolls away. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-header" />
      <div className="pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">{children}</div>
      <TabBar />
      <Toaster />
      <AppLifecycle />
    </>
  );
}
