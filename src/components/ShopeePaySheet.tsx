import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { PrimaryButton, Sheet } from "@/components/Sheet";
import {
  adjustShopeePay,
  setShopeePayBalance,
  shopeePayAccount,
  useFinance,
  useMoney,
} from "@/lib/finance-store";
import { useT } from "@/lib/i18n";
import { reportMutation } from "@/lib/mutation-feedback";
import { toast } from "@/lib/toast-store";

type Props = { open: boolean; onClose: () => void };

/** Digits only — the sign comes from the Income/Expense choice. */
const digitsOnly = (value: string) => value.replace(/[^\d]/g, "").slice(0, 12);

/**
 * Persistent Shopee Pay balance editor.
 *
 * Movements follow `current + income − expense = new balance`, so a −10.000
 * balance with a 6.000 income becomes −4.000. The balance is stored on its own
 * wallet row, which means it survives midnight and every app restart.
 */
export function ShopeePaySheet({ open, onClose }: Props) {
  const state = useFinance();
  const money = useMoney();
  const { t, lang } = useT();
  const wallet = shopeePayAccount(state);
  const balance = wallet?.amount ?? 0;

  const [mode, setMode] = useState<"income" | "expense">("income");
  const [amount, setAmount] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("income");
    setAmount("");
    setManual(String(balance));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = Number(amount || 0);
  const preview = mode === "income" ? balance + value : balance - value;
  const manualValue = Number(manual.replace(/[^\d-]/g, "") || 0);

  function applyMovement() {
    if (!(value > 0)) return;
    const result = adjustShopeePay(mode === "income" ? value : -value);
    if (!reportMutation(result, "wallet", lang)) return;
    toast.success(t("sp.saved"));
    setAmount("");
  }

  function saveManual() {
    const result = setShopeePayBalance(manualValue);
    if (!reportMutation(result, "wallet", lang)) return;
    toast.success(t("sp.saved"));
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("sp.title")}>
      <div className="pb-4">
        <div className="glass mt-4 rounded-2xl px-4 py-3.5">
          <p className="text-muted-foreground text-[10px] tracking-widest uppercase">
            {t("sp.current")}
          </p>
          <p
            data-testid="shopee-balance"
            className={`mt-1 text-2xl leading-none font-semibold tabular-nums ${
              balance < 0 ? "text-expense" : "text-income"
            }`}
          >
            {money(balance)}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["income", "expense"] as const).map((option) => {
            const active = option === mode;
            const Icon = option === "income" ? ArrowDownLeft : ArrowUpRight;
            return (
              <button
                key={option}
                onClick={() => setMode(option)}
                aria-pressed={active}
                className={`tap flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-medium transition-colors duration-200 ${
                  active
                    ? option === "income"
                      ? "bg-income/15 text-income ring-income/40 ring-1"
                      : "bg-expense/15 text-expense ring-expense/40 ring-1"
                    : "glass text-muted-foreground"
                }`}
              >
                <Icon className="size-4" strokeWidth={2} />
                {t(option === "income" ? "sp.income" : "sp.expense")}
              </button>
            );
          })}
        </div>

        <label className="glass mt-3 block rounded-2xl px-3.5 py-2.5">
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            {t(mode === "income" ? "sp.income" : "sp.expense")}
          </span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(digitsOnly(e.target.value))}
            placeholder="0"
            aria-label={t(mode === "income" ? "sp.income" : "sp.expense")}
            className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-lg font-semibold tabular-nums outline-none"
          />
        </label>

        <p className="text-muted-foreground mt-2 text-[11px]">
          {money(balance)} {mode === "income" ? "+" : "−"} {money(value)} ={" "}
          <span className={`font-semibold ${preview < 0 ? "text-expense" : "text-income"}`}>
            {money(preview)}
          </span>
        </p>

        <PrimaryButton disabled={!(value > 0)} onClick={applyMovement}>
          {t("sp.apply")}
        </PrimaryButton>

        <div className="bg-border/70 mt-6 h-px" />

        <label className="glass mt-4 block rounded-2xl px-3.5 py-2.5">
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            {t("sp.manual")}
          </span>
          <input
            inputMode="text"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/[^\d-]/g, "").slice(0, 13))}
            aria-label={t("sp.manual")}
            className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-lg font-semibold tabular-nums outline-none"
          />
        </label>
        <p className="text-muted-foreground mt-2 text-[11px]">{t("sp.manualHint")}</p>

        <PrimaryButton onClick={saveManual}>{t("sp.save")}</PrimaryButton>

        <p className="text-muted-foreground mt-4 text-[11px]">{t("sp.hint")}</p>
      </div>
    </Sheet>
  );
}
