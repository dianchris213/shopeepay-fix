import { useEffect, useMemo, useState } from "react";

import { PrimaryButton, Sheet } from "@/components/Sheet";
import { useFinance } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";
import { pushToast } from "@/lib/toast-store";
import { trackUsage } from "@/lib/usage-analytics";
import { buildWhatsAppSummary, whatsappShareUrl } from "@/lib/wa-export";

type Props = { open: boolean; onClose: () => void };

/**
 * Shows the exact WhatsApp text before anything leaves the app, so an export
 * can never surprise the user with stale or wrong numbers.
 */
export function WAExportPreviewSheet({ open, onClose }: Props) {
  const state = useFinance();
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  // Freeze the summary while the sheet is open so the preview matches the send.
  const summary = useMemo(() => (open ? buildWhatsAppSummary(state) : ""), [open, state]);

  // Usage metric: how often the export preview is actually looked at.
  useEffect(() => {
    if (open) trackUsage("wa_export_preview_opened");
  }, [open]);

  function copy() {
    void navigator.clipboard?.writeText(summary).then(() => {
      setCopied(true);
      pushToast({ tone: "success", title: t("wap.copied") });
    });
  }

  function send() {
    window.open(whatsappShareUrl(summary), "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("wap.title")}>
      <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">{t("wap.hint")}</p>

      <pre
        data-testid="wa-export-preview"
        tabIndex={0}
        role="region"
        aria-live="polite"
        aria-label={t("wap.title")}
        className="glass mt-3 max-h-[46vh] overflow-auto rounded-2xl p-3.5 text-[11px] leading-relaxed whitespace-pre-wrap"
      >
        {summary}
      </pre>

      <div className="mt-3 mb-2 flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="tap glass flex-1 rounded-full px-3 py-2.5 text-[12px] font-semibold"
        >
          {copied ? t("wap.copied") : t("wap.copy")}
        </button>
      </div>
      <div className="pb-4">
        <PrimaryButton onClick={send}>{t("wap.send")}</PrimaryButton>
      </div>
    </Sheet>
  );
}
