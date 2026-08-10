import { useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, Bell, Trash2 } from "lucide-react";

import { Sheet } from "@/components/Sheet";
import {
  clearNotifications,
  markNotificationsRead,
  relativeDate,
  useFinance,
} from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notifications } = useFinance();
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(markNotificationsRead, 700);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={t("nt.title")} side="right">
      <div className="mt-4 flex items-center justify-between">
        <p className="text-muted-foreground text-[11px]">
          {notifications.length} alert{notifications.length === 1 ? "" : "s"}
        </p>
        {notifications.length > 0 && (
          <button
            onClick={clearNotifications}
            className="tap text-muted-foreground inline-flex items-center gap-1 text-[11px]"
          >
            <Trash2 className="size-3.5" strokeWidth={1.9} /> Clear all
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2.5 pb-4">
        {notifications.map((n) => {
          const Icon =
            n.tone === "income" ? ArrowDownLeft : n.tone === "expense" ? ArrowUpRight : Bell;
          const color =
            n.tone === "income"
              ? "var(--income)"
              : n.tone === "expense"
                ? "var(--expense)"
                : "var(--primary)";
          return (
            <li
              key={n.id}
              className="glass animate-fade-in flex items-start gap-3 rounded-2xl px-3.5 py-3"
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full"
                style={{
                  backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                  color,
                }}
              >
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  {!n.read && <span className="bg-primary size-1.5 shrink-0 rounded-full" />}
                </div>
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{n.body}</p>
                <p className="text-muted-foreground/70 mt-1 text-[10px]">{relativeDate(n.date)}</p>
              </div>
            </li>
          );
        })}
        {notifications.length === 0 && (
          <li className="glass text-muted-foreground rounded-2xl px-3.5 py-8 text-center text-xs">
            {t("nt.empty")}
          </li>
        )}
      </ul>
    </Sheet>
  );
}
