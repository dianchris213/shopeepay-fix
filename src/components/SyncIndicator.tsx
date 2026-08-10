import { Cloud, CloudOff, CloudUpload, RefreshCw } from "lucide-react";

import { useSyncState } from "@/lib/sync-status";
import { useT } from "@/lib/i18n";

/**
 * Tiny cloud badge telling the user whether their data made it to the cloud.
 * Hidden while nothing has ever been synced (status "idle").
 *
 * Accessibility notes:
 * - The wrapper is a polite live region, so every transition between
 *   Syncing / Synced / Offline / Unsaved changes is announced without
 *   stealing focus from whatever the user is doing.
 * - The announced text lives in a visually hidden child rather than in an
 *   `aria-label`, because screen readers re-read changed *content* inside a
 *   live region but do not reliably re-announce a changed label.
 * - `aria-atomic` makes the reader speak the whole status (including the
 *   pending count) instead of just the diffed word.
 * - The badge is a tab stop so keyboard and screen-reader users can park on
 *   it and hear the current state on demand.
 */
export function SyncIndicator({ className = "" }: { className?: string }) {
  const { status, pending } = useSyncState();
  const { t } = useT();
  if (status === "idle") return null;

  const map = {
    syncing: {
      Icon: RefreshCw,
      label: t("sync.syncing"),
      tone: "text-muted-foreground animate-spin",
    },
    synced: { Icon: Cloud, label: t("sync.synced"), tone: "text-income" },
    offline: { Icon: CloudOff, label: t("sync.offline"), tone: "text-muted-foreground" },
    error: { Icon: CloudUpload, label: t("sync.unsaved"), tone: "text-expense" },
  } as const;
  const { Icon, label, tone } = map[status];

  const pendingLabel = pending
    ? `${label} — ${t("sync.pendingCount").replace("{n}", String(pending))}`
    : label;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      tabIndex={0}
      title={pendingLabel}
      aria-label={pendingLabel}
      /* Focus ring: offset from the badge so it stays fully visible on every
         tone (income / expense / muted) and never clips against the header. */
      className={`focus-visible:ring-ring focus-visible:ring-offset-background inline-grid size-6 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}
    >
      <Icon className={`size-[16px] ${tone}`} strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">{pendingLabel}</span>
    </span>
  );
}
