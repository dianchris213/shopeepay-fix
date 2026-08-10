import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, CloudUpload, History, RefreshCw, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useT } from "@/lib/i18n";
import { formatSyncLog } from "@/lib/sync-log";
import { retryNow } from "@/lib/sync-queue";
import { resetSyncHistory, useLastSyncedAt, useSyncHistory, useSyncState } from "@/lib/sync-status";
import { pushToast } from "@/lib/toast-store";

/** "just now" / "12 min ago" / absolute date once it is more than a day old. */
function formatRelative(ts: number, now: number, locale: string) {
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return { rel: "just now", abs: new Date(ts).toLocaleTimeString(locale) };
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60)
    return { rel: rtf.format(-min, "minute"), abs: new Date(ts).toLocaleString(locale) };
  const hrs = Math.round(min / 60);
  if (hrs < 24) return { rel: rtf.format(-hrs, "hour"), abs: new Date(ts).toLocaleString(locale) };
  const days = Math.round(hrs / 24);
  return { rel: rtf.format(-days, "day"), abs: new Date(ts).toLocaleString(locale) };
}

const eventKey = {
  syncing: "sync.ev.syncing",
  synced: "sync.ev.synced",
  offline: "sync.ev.offline",
  error: "sync.ev.error",
} as const;

const eventTone = {
  syncing: "bg-primary",
  synced: "bg-income",
  offline: "bg-muted-foreground",
  error: "bg-expense",
} as const;

/**
 * Minimal sync debug panel: how much is still queued, when the queue last
 * drained cleanly, and an escape hatch to force a drain immediately.
 */
export function SyncStatusPanel() {
  const { status, pending } = useSyncState();
  const lastSyncedAt = useLastSyncedAt();
  const historyEntries = useSyncHistory();
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Keeps the relative timestamp honest without re-rendering the whole page.
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      mounted.current = false;
      clearInterval(id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const locale = lang === "id" ? "id-ID" : "en-US";
  const stamp = lastSyncedAt ? formatRelative(lastSyncedAt, now, locale) : null;

  async function handleRetry() {
    if (busy) return;
    setBusy(true);
    try {
      await retryNow();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function handleCopy() {
    const text = formatSyncLog({
      header: t("sync.logHeader"),
      status,
      pending,
      lastSyncedAt,
      entries: historyEntries,
      labelFor: (s) => t(eventKey[s]),
    });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard unavailable");
      }
      if (!mounted.current) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        copyTimer.current = null;
        if (mounted.current) setCopied(false);
      }, 2000);
    } catch {
      pushToast({ tone: "error", title: t("sync.copyFailed"), body: t("sync.copyFailedBody") });
    }
  }

  function handleClearConfirmed() {
    resetSyncHistory();
    setConfirmClear(false);
    pushToast({ tone: "success", title: t("sync.clearedTitle"), body: t("sync.clearedBody") });
  }

  const queueSub = pending
    ? t("sync.queueSome").replace("{n}", String(pending))
    : t("sync.queueEmpty");

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${
            pending ? "bg-expense/15 text-expense" : "bg-income/15 text-income"
          }`}
        >
          <CloudUpload className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("sync.queueLabel")}</p>
          <p className="text-muted-foreground text-[11px]" data-testid="sync-queue-sub">
            {queueSub}
          </p>
        </div>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="sync-queue-count"
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
            pending ? "bg-expense/15 text-expense" : "bg-income/15 text-income"
          }`}
        >
          {pending}
          <span className="sr-only"> {t("sync.pendingCount").replace("{n}", String(pending))}</span>
        </span>
      </div>

      <div className="bg-border/70 mx-4 h-px" />

      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="bg-primary/15 text-primary grid size-10 shrink-0 place-items-center rounded-full">
          <History className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("sync.lastLabel")}</p>
          <p className="text-muted-foreground text-[11px]" data-testid="sync-last-at">
            {stamp ? stamp.rel : t("sync.lastNever")}
          </p>
        </div>
        {stamp && (
          <time
            dateTime={new Date(lastSyncedAt!).toISOString()}
            className="text-muted-foreground shrink-0 text-[10px] tabular-nums"
          >
            {stamp.abs}
          </time>
        )}
      </div>

      <div className="bg-border/70 mx-4 h-px" />

      <div className="px-4 py-3.5">
        <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
          {t("sync.historyLabel")}
        </p>
        {historyEntries.length === 0 ? (
          <p className="text-muted-foreground text-[11px]" data-testid="sync-history-empty">
            {t("sync.historyEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="sync-history">
            {historyEntries.map((ev) => (
              <li key={`${ev.at}-${ev.status}`} className="flex items-center gap-2 text-[11px]">
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full ${eventTone[ev.status]}`}
                />
                <span className="min-w-0 flex-1 truncate">{t(eventKey[ev.status])}</span>
                <time
                  dateTime={new Date(ev.at).toISOString()}
                  className="text-muted-foreground shrink-0 tabular-nums"
                >
                  {new Date(ev.at).toLocaleTimeString(locale)}
                </time>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopy}
            data-testid="sync-history-copy"
            aria-label={t("sync.copyHistory")}
            className="tap glass focus-visible:ring-ring/70 flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-3 text-[11px] font-semibold outline-none focus-visible:ring-2"
          >
            {copied ? (
              <Check className="text-income size-3.5" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <ClipboardCopy className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
            )}
            <span data-testid="sync-history-copy-label">
              {copied ? t("sync.copied") : t("sync.copyHistory")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={historyEntries.length === 0}
            data-testid="sync-history-clear"
            aria-label={t("sync.clearHistory")}
            className="tap glass focus-visible:ring-ring/70 text-expense flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-3 text-[11px] font-semibold outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
            <span>{t("sync.clearHistory")}</span>
          </button>
        </div>

        <span aria-live="polite" role="status" className="sr-only" data-testid="sync-copy-live">
          {copied ? t("sync.copied") : ""}
        </span>
      </div>

      <div className="bg-border/70 mx-4 h-px" />

      <div className="px-4 py-3.5">
        <button
          type="button"
          onClick={handleRetry}
          disabled={busy}
          data-testid="sync-force-retry"
          className="tap glass focus-visible:ring-ring/70 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium outline-none focus-visible:ring-2 disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 ${busy || status === "syncing" ? "animate-spin" : ""}`}
            strokeWidth={1.9}
            aria-hidden="true"
          />
          {busy ? t("sync.nowRunning") : pending ? t("sync.forceRetry") : t("sync.now")}
        </button>
      </div>

      <ConfirmDeleteDialog
        open={confirmClear}
        title={t("sync.clearHistoryTitle")}
        description={t("sync.clearHistoryBody")}
        confirmLabel={t("sync.clearHistoryConfirm")}
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClearConfirmed}
      />
    </>
  );
}
