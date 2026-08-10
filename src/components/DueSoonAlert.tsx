import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Sheet } from "@/components/Sheet";
import { iconFor } from "@/lib/icon-map";
import { daysUntil, dueLabel, useFinance, useMoney, type Bill } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

const SESSION_KEY = "c2h.billAlert.shown";

/**
 * Prominent warning shown when a bill hits H-1 (or is due today / overdue).
 * Appears once per day per session; closes only via the X button.
 */
export function DueSoonAlert() {
  const { bills } = useFinance();
  const { t } = useT();
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const [urgent, setUrgent] = useState<Bill[]>([]);

  useEffect(() => {
    const due = bills.filter((b) => {
      if (b.paid || !b.dueDate) return false;
      const n = daysUntil(b.dueDate);
      return !Number.isNaN(n) && n <= 1;
    });
    if (due.length === 0) return;

    const today = new Date().toDateString();
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === today) return;
      window.sessionStorage.setItem(SESSION_KEY, today);
    } catch {
      /* ignore storage errors */
    }
    setUrgent(due);
    setOpen(true);
  }, [bills]);

  if (urgent.length === 0) return null;

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={t("alert.billDueTitle")}>
      <div className="mt-4 flex items-center gap-3">
        <span className="glow-expense bg-expense/15 text-expense grid size-11 shrink-0 place-items-center rounded-full">
          <AlertTriangle className="size-5" strokeWidth={2} />
        </span>
        <p className="text-sm font-medium">
          {urgent.length === 1
            ? t("alert.billDueOne")
            : `${urgent.length} ${t("alert.billDueMany")}`}
        </p>
      </div>

      <ul className="mt-4 space-y-2.5 pb-4">
        {urgent.map((bill) => {
          const Icon = iconFor(bill.icon);
          return (
            <li key={bill.id} className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3">
              <span className="bg-expense/15 text-expense grid size-10 shrink-0 place-items-center rounded-full">
                <Icon className="size-[18px]" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{bill.name}</p>
                <p className="text-expense text-[11px]" suppressHydrationWarning>
                  {dueLabel(bill.dueDate)}
                </p>
              </div>
              <p className="text-expense shrink-0 text-sm font-semibold tabular-nums">
                {money(bill.amount)}
              </p>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
