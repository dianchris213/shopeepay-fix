import { useEffect } from "react";

import { setBackfillReporter } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";
import { dismissToast, pushToast } from "@/lib/toast-store";

/**
 * Surfaces a subtle toast when legacy transactions get their `walletId`
 * backfilled, so the one-off migration never looks like a frozen app.
 *
 * Two-phase by design: a short "optimizing…" info toast while the migration
 * runs, replaced by an explicit success/completion toast so the user is told
 * the work actually finished instead of being left with a trailing ellipsis.
 *
 * Both toasts render inside ToastHost's `pointer-events-none` overlay, so the
 * banner never creates an invisible hitbox over the rest of the UI — only the
 * toast card itself (and its dismiss button) is clickable.
 */
export function BackfillNotice() {
  const { t } = useT();

  useEffect(() => {
    let progressId: string | null = null;
    let completionTimer: ReturnType<typeof setTimeout> | null = null;

    setBackfillReporter((migrated) => {
      // Phase 1 — progress. Kept until the completion toast replaces it.
      if (progressId) dismissToast(progressId);
      progressId = pushToast({
        tone: "info",
        title: t("mig.title"),
        body: t("mig.body").replace("{n}", String(migrated)),
        duration: 0,
      });

      // Phase 2 — completion. The migration itself is synchronous, so this is
      // purely so the user can read the progress line before it resolves.
      if (completionTimer) clearTimeout(completionTimer);
      completionTimer = setTimeout(() => {
        completionTimer = null;
        if (progressId) {
          dismissToast(progressId);
          progressId = null;
        }
        pushToast({
          tone: "success",
          title: t("mig.doneTitle"),
          body: t("mig.doneBody").replace("{n}", String(migrated)),
        });
      }, 1200);
    });

    return () => {
      setBackfillReporter(null);
      if (completionTimer) clearTimeout(completionTimer);
      if (progressId) dismissToast(progressId);
    };
  }, [t]);

  return null;
}
