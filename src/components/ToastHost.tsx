import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { clearToasts, dismissToast, pushToast, useToasts, type ToastTone } from "@/lib/toast-store";
import { useT } from "@/lib/i18n";

const toneStyle: Record<ToastTone, { color: string; Icon: typeof Info }> = {
  error: { color: "var(--expense)", Icon: XCircle },
  warning: { color: "var(--chart-4)", Icon: AlertTriangle },
  success: { color: "var(--income)", Icon: CheckCircle2 },
  info: { color: "var(--primary)", Icon: Info },
};

/**
 * Global glassmorphism banner stack. Rendered once at the app root so any
 * module can surface a human-readable message via `toast.error(...)`.
 */
export function ToastHost() {
  const toasts = useToasts();
  const { t } = useT();

  // Dev-only automation hook: lets the E2E suite render a real toast (e.g. the
  // backfill notice) without needing a legacy dataset. Never ships to prod.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    (window as unknown as Record<string, unknown>)["__c2hToast"] = {
      push: pushToast,
      clear: clearToasts,
      backfill: (n = 3) =>
        pushToast({
          tone: "info",
          title: t("mig.title"),
          body: t("mig.body").replace("{n}", String(n)),
          duration: 0,
        }),
    };
    return () => {
      delete (window as unknown as Record<string, unknown>)["__c2hToast"];
    };
  }, [t]);

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] mx-auto flex w-full max-w-md flex-col gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      {toasts.map((item) => {
        const { color, Icon } = toneStyle[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className="glass animate-fade-in pointer-events-auto flex items-start gap-3 rounded-2xl px-3.5 py-3"
            style={{
              borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
              boxShadow: `0 0 24px -8px color-mix(in oklab, ${color} 80%, transparent), var(--shadow-glass)`,
            }}
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full"
              style={{
                backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                color,
              }}
            >
              <Icon className="size-[17px]" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug font-semibold tracking-tight" style={{ color }}>
                {item.title}
              </p>
              {item.body && (
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                  {item.body}
                </p>
              )}
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action!.onClick();
                    dismissToast(item.id);
                  }}
                  className="tap glass mt-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                  style={{ color }}
                >
                  {item.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label={t("toast.dismiss")}
              /* 44x44 touch target: padding grows the hitbox, negative margin
                 keeps the visual 28px pill exactly where it was. */
              className="tap text-muted-foreground -m-2 grid shrink-0 place-items-center rounded-full p-2"
            >
              <span className="glass grid size-7 place-items-center rounded-full">
                <X className="size-3.5" strokeWidth={2.2} />
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
