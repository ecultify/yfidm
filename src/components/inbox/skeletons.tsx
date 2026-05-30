import { Skeleton } from "@/components/ui/skeleton";

export function ConversationListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-lg p-2.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="flex justify-between gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-3 w-full max-w-[200px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={i % 2 === 0 ? "flex justify-start" : "flex justify-end"}
        >
          <Skeleton
            className="h-12 rounded-2xl"
            style={{ width: `${180 + ((i * 47) % 140)}px` }}
          />
        </div>
      ))}
    </div>
  );
}
