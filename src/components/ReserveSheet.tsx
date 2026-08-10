import { useEffect, useState } from "react";
import { Check, Shield } from "lucide-react";

import { AmountField, Chip, PrimaryButton, Sheet } from "@/components/Sheet";
import { reportMutation } from "@/lib/mutation-feedback";
import { moveToReserve, useFinance, useMoney } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

export function ReserveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accounts, reserve } = useFinance();
  const money = useMoney();
  const { t, lang } = useT();
  const [digits, setDigits] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDigits("");
    setDone(false);
    setDirection("in");
    setAccountId(accounts[0]?.id ?? "");
  }, [open, accounts]);

  const amount = Number(digits || 0);
  const account = accounts.find((a) => a.id === accountId);
  const max = direction === "in" ? (account?.amount ?? 0) : reserve;
  const canSubmit = amount > 0 && amount <= max && !!account && !done;

  function submit() {
    if (!canSubmit) return;
    if (!reportMutation(moveToReserve(accountId, amount, direction), "wallet", lang)) return;
    setDone(true);
    window.setTimeout(onClose, 520);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("reserve.title")}>
      <div className="glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3">
        <span className="bg-primary/15 text-primary grid size-10 place-items-center rounded-full">
          <Shield className="size-[18px]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[11px]">{t("reserve.current")}</p>
          <p className="text-sm font-semibold tabular-nums">{money(reserve)}</p>
        </div>
      </div>

      <div className="glass mt-4 grid grid-cols-2 gap-1 rounded-full p-1">
        {(
          [
            ["in", t("reserve.in")],
            ["out", t("reserve.out")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setDirection(value)}
            aria-pressed={direction === value}
            className={`tap rounded-full py-2 text-xs font-semibold transition-colors duration-200 ${
              direction === value
                ? "bg-primary/20 text-foreground shadow-primary/40 shadow-[0_0_16px]"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <AmountField digits={digits} onDigits={setDigits} accent="var(--primary)" />

      <p className="mt-4 text-xs font-semibold tracking-tight">
        {direction === "in" ? t("reserve.takeFrom") : t("reserve.sendTo")}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Chip key={a.id} active={a.id === accountId} onClick={() => setAccountId(a.id)}>
            {a.name}
          </Chip>
        ))}
      </div>

      <p className="text-muted-foreground mt-3 text-[11px]">
        {t("reserve.available")}: <span className="tabular-nums">{money(max)}</span>
      </p>
      {amount > max && (
        <p className="text-expense mt-1 text-[11px] font-medium">{t("reserve.exceeds")}</p>
      )}

      <PrimaryButton disabled={!canSubmit} onClick={submit}>
        {done ? (
          <>
            <Check className="animate-scale-in size-5" strokeWidth={2.4} /> {t("common.done")}
          </>
        ) : direction === "in" ? (
          t("reserve.stash")
        ) : (
          t("reserve.withdraw")
        )}
      </PrimaryButton>
    </Sheet>
  );
}
