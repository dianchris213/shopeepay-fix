import { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";

import { useT } from "@/lib/i18n";

type Props = {
  open: boolean;
  title: string;
  /** Plain-language description of what will be removed. */
  description: string;
  /** Optional extra detail line (e.g. name + balance). */
  detail?: string | undefined;
  confirmLabel?: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Reusable, highly visible destructive-action confirmation.
 * Used for every delete across wallets, categories and bills.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  detail,
  confirmLabel,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useT();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const descriptionId = useId();

  // Keyboard + focus management: Escape closes, Tab is trapped inside the panel,
  // and focus returns to the trigger once the dialog closes.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center px-6" data-testid="confirm-delete">
      <button
        type="button"
        aria-label={t("common.cancel")}
        tabIndex={-1}
        onClick={onCancel}
        className="animate-fade-in absolute inset-0 cursor-default bg-black/65 backdrop-blur-[3px]"
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={descriptionId}
        className="glass animate-scale-in relative w-full max-w-sm rounded-3xl p-6 text-center"
        style={{
          borderColor: "color-mix(in oklab, var(--destructive) 35%, transparent)",
          boxShadow: "0 20px 60px -20px color-mix(in oklab, var(--destructive) 55%, transparent)",
        }}
      >
        <span
          className="mx-auto grid size-12 place-items-center rounded-full"
          style={{
            backgroundColor: "color-mix(in oklab, var(--destructive) 18%, transparent)",
            color: "var(--destructive)",
          }}
        >
          <AlertTriangle className="size-6" strokeWidth={2} />
        </span>

        <h2 className="mt-3 text-base font-semibold tracking-tight">{title}</h2>
        {detail && <p className="mt-1 text-xs font-medium tabular-nums">{detail}</p>}
        <p id={descriptionId} className="text-muted-foreground mt-2 text-xs leading-relaxed">
          {description}
        </p>
        <p className="mt-2 text-[11px] font-semibold" style={{ color: "var(--destructive)" }}>
          {t("confirm.cannotUndo")}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="glass tap text-muted-foreground rounded-2xl py-3 text-xs font-semibold"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="tap rounded-2xl py-3 text-xs font-semibold"
            style={{
              backgroundColor: "var(--destructive)",
              color: "var(--destructive-foreground)",
              boxShadow:
                "0 10px 30px -10px color-mix(in oklab, var(--destructive) 80%, transparent)",
            }}
          >
            {confirmLabel ?? t("confirm.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
