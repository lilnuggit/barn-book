import { Skeleton } from "../ui";

export function DaySkeleton() {
  return (
    <>
      <div className="bg-header pt-safe">
        <div className="mx-auto max-w-xl px-4 pt-2 pb-5">
          <div className="h-11" />
          <div className="h-4 w-16 rounded bg-header-fill" />
          <div className="mt-2 h-8 w-64 rounded-lg bg-header-fill" />
          <div className="mt-5 h-1.5 rounded-full bg-header-fill" />
        </div>
      </div>
      <div className="mx-auto max-w-xl space-y-3 px-4 pt-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[76px] rounded-2xl" />
        ))}
      </div>
    </>
  );
}
