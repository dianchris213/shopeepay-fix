import { Skeleton } from "@/components/ui/skeleton";

/**
 * Content-shaped loading state for the dashboard. A skeleton that mirrors the
 * real layout reads as "almost there" instead of the blank-spinner stall the
 * Mini App used to show while cloud data hydrated.
 */
export function DashboardSkeleton({ label }: { label?: string | undefined }) {
  return (
    <div
      data-testid="dashboard-skeleton"
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-md px-4 pt-6 pb-24"
    >
      {label ? <span className="sr-only">{label}</span> : null}

      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="size-9 rounded-full" />
      </div>

      {/* balance card */}
      <Skeleton className="mt-6 h-36 w-full rounded-3xl" />

      {/* stream strip */}
      <div className="mt-4 flex gap-3">
        <Skeleton className="h-24 flex-1 rounded-2xl" />
        <Skeleton className="h-24 flex-1 rounded-2xl" />
      </div>

      {/* quick actions */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>

      {/* recent transactions */}
      <Skeleton className="mt-6 h-3 w-32" />
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chart-shaped placeholder used by the analytics route. */
export function ChartSkeleton({ height = "h-52" }: { height?: string }) {
  return (
    <div role="status" aria-busy="true" className="glass rounded-3xl p-4">
      <Skeleton className="h-3 w-28" />
      <Skeleton className={`mt-4 w-full rounded-2xl ${height}`} />
    </div>
  );
}
