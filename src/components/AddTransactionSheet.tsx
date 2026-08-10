import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import { CategoryManagerSheet } from "@/components/CategoryManagerSheet";
import { Chip, PrimaryButton, Sheet } from "@/components/Sheet";
import {
  iconMap,
  isDriverCategory,
  useCategories,
  visibleCategoriesFor,
} from "@/lib/categories-store";
import {
  addTransaction,
  cashAccount,
  codOverflowFor,
  deleteTransaction,
  formatAmount,
  getState,
  isDriverCodCategory,
  shopeePayAccount,
  useFinance,
} from "@/lib/finance-store";
import { reportMutation } from "@/lib/mutation-feedback";
import { pushToast } from "@/lib/toast-store";
import { trackUsage } from "@/lib/usage-analytics";
import { useT } from "@/lib/i18n";

import {
  sanitizeAmountDigits,
  validateTransactionInput,
  type TransactionField,
} from "@/lib/transaction-input";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Local calendar day — `toISOString()` would shift a day for UTC+ timezones. */
const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const groupDigits = (digits: string) =>
  digits === "" ? "0" : Number(digits).toLocaleString("id-ID");

/** Accept both the canonical Driver type and legacy ShopeePay wallet names. */
const isShopeePayWallet = (wallet: { type: string; name: string } | null) =>
  wallet?.type === "Driver" || wallet?.name.replaceAll(/\s/g, "").toLowerCase() === "shopeepay";

export function AddTransactionSheet({ open, onClose }: Props) {
  const { accounts } = useFinance();
  const { t, lang } = useT();
  const allCategories = useCategories();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [digits, setDigits] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO);
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [codConfirm, setCodConfirm] = useState(false);
  const [cashNeeded, setCashNeeded] = useState(false);
  // Shortcut from the empty-category hint straight into category management.
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const submitLock = useRef(false);
  const timers = useRef<number[]>([]);
  const lastDefaults = useRef<string | null>(null);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    if (!open) return;
    setKind("expense");
    setDigits("");
    setCategoryId(null);
    setWalletId(null);
    setNote("");
    setDate(todayISO());
    setSaved(false);
    setCodConfirm(false);
    setCashNeeded(false);
    setCategoryManagerOpen(false);
    setTouched(false);
    setSubmitting(false);
    submitLock.current = false;
    lastDefaults.current = null;
  }, [open]);

  const selectedWallet = accounts.find((a) => a.id === walletId) ?? null;

  const visibleCategories = useMemo(
    () =>
      selectedWallet
        ? visibleCategoriesFor({
            categories: allCategories,
            kind,
            walletType: selectedWallet.type,
            walletId: selectedWallet.id,
          })
        : // Nothing is shown until a wallet is picked — the wallet decides which
          // categories are legal, so the first open must not offer stale chips.
          [],
    [allCategories, kind, selectedWallet],
  );

  const amount = Number(digits || 0);
  const accent = kind === "expense" ? "var(--expense)" : "var(--income)";
  const category = visibleCategories.find((c) => c.id === categoryId) ?? null;

  // Clear a category that the current wallet no longer allows.
  useEffect(() => {
    if (categoryId && !visibleCategories.some((c) => c.id === categoryId)) setCategoryId(null);
  }, [categoryId, visibleCategories]);

  const isShopeeIncome = kind === "income" && isShopeePayWallet(selectedWallet);

  /**
   * Category default rules:
   * - Expense tab: always empty.
   * - Income tab + Shopee Pay wallet: auto-select "Driver COD".
   * - Anything else: empty.
   */
  useEffect(() => {
    const key = `${kind}:${selectedWallet?.id ?? "none"}`;
    const pending = isShopeeIncome && visibleCategories.length === 0;
    if (lastDefaults.current === key || pending) return;
    lastDefaults.current = key;

    if (kind === "expense") {
      setCategoryId(null);
      return;
    }

    if (isShopeeIncome) {
      const driverCodCategory = visibleCategories.find(
        (c) => c.name.trim().toLowerCase() === "driver cod",
      );
      setCategoryId(driverCodCategory ? driverCodCategory.id : null);
      return;
    }

    setCategoryId(null);
  }, [kind, selectedWallet?.id, isShopeeIncome, visibleCategories]);


  /** Picking a Driver category books it on the persistent Shopee Pay wallet. */
  function pickCategory(id: string, name: string) {
    setCategoryId(id);
    if (isDriverCategory(name)) {
      const driver = shopeePayAccount();
      if (driver) setWalletId(driver.id);
    }
  }

  /** Switching the tab re-evaluates the category default. */
  function selectKind(nextKind: "expense" | "income") {
    setKind(nextKind);
    setCategoryId(null);
    lastDefaults.current = null;
  }

  /** Switching the wallet re-evaluates the category default. */
  function selectWallet(nextWalletId: string) {
    setWalletId(nextWalletId);
    setCategoryId(null);
    lastDefaults.current = null;
  }


  const validation = validateTransactionInput({
    kind,
    amount,
    categoryId: category ? category.id : null,
    wallet: selectedWallet?.name ?? null,
    note,
    date,
  });
  const invalidFields: TransactionField[] = validation.ok ? [] : validation.fields;
  const amountValid = !invalidFields.includes("amount");
  const canSave = validation.ok && !saved && !submitting;

  const fieldLabels: Record<TransactionField, string> = {
    amount: t("tx.missingAmount"),
    category: t("tx.missingCategory"),
    wallet: t("tx.missingWallet"),
    date: t("tx.missingDate"),
    note: t("tx.missingNote"),
  };
  const missing = invalidFields.map((field) => fieldLabels[field]);

  const isCod = !!category && isDriverCodCategory(category.name);

  /**
   * True when this COD amount would push Shopee Pay from positive to negative
   * while the user has no Cash wallet to receive the surplus.
   */
  function codOverflowNeedsCash() {
    const driver = shopeePayAccount();
    if (!driver) return false;
    return codOverflowFor(driver.amount, amount) > 0 && !cashAccount();
  }

  /** Undo window (ms) offered after a Driver COD deduction is booked. */
  const UNDO_MS = 8000;

  function handleSave() {
    if (submitLock.current) return;
    if (!canSave || !validation.ok) {
      setTouched(true);
      return;
    }
    // Driver COD subtracts from the Shopee Pay balance — always confirm first,
    // and refuse up-front when its overflow would have nowhere to land.
    if (isCod) {
      if (codOverflowNeedsCash()) {
        setCashNeeded(true);
        return;
      }
      setCodConfirm(true);
      return;
    }
    commit();
  }

  function commit() {
    if (submitLock.current) return;
    if (!canSave || !validation.ok) return;
    submitLock.current = true;
    setSubmitting(true);
    setCodConfirm(false);

    try {
      const input = validation.value;
      const picked = new Date(`${input.date}T${new Date().toTimeString().slice(0, 8)}`);
      const iso = (Number.isNaN(picked.getTime()) ? new Date() : picked).toISOString();
      const result = addTransaction({
        name: input.note || category!.name,
        walletId: selectedWallet?.id ?? "",
        via: input.wallet,
        category: category!.name,
        date: iso,
        amount: input.kind === "expense" ? -input.amount : input.amount,
        icon: category!.icon,
      });
      // Store-level guards can still reject (e.g. insufficient balance).
      if (!reportMutation(result, "wallet", lang)) {
        submitLock.current = false;
        setSubmitting(false);
        return;
      }
      if (isCod) {
        // Safety net: the booked deduction can be reverted for a few seconds.
        const booked = getState().transactions[0];
        if (booked) {
          pushToast({
            tone: "warning",
            title: t("cod.bookedTitle"),
            body: `${booked.name} · ${formatAmount(Math.abs(booked.amount), getState().settings.currency, lang)}`,
            duration: UNDO_MS,
            action: {
              label: t("cod.undo"),
              onClick: () => {
                trackUsage("driver_cod_undo");
                deleteTransaction(booked.id);
              },
            },
          });
        }
      }
      setSaved(true);
      timers.current.push(window.setTimeout(onClose, 520));
    } catch (error) {
      console.error("[add transaction]", error);
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const invalidRing = (isInvalid: boolean) =>
    isInvalid && touched
      ? { borderColor: "var(--destructive)", boxShadow: "0 0 0 1px var(--destructive)" }
      : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={t("tx.addTitle")}>
      <div className="glass mt-4 grid grid-cols-2 gap-1 rounded-full p-1">
        {(["expense", "income"] as const).map((option) => {
          const isActive = kind === option;
          const color = option === "expense" ? "var(--expense)" : "var(--income)";
          return (
            <button
              key={option}
              onClick={() => selectKind(option)}
              aria-pressed={isActive}
              className="tap rounded-full py-2 text-xs font-semibold capitalize transition-colors duration-200"
              style={
                isActive
                  ? {
                      backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`,
                      color,
                      boxShadow: `0 0 18px -4px color-mix(in oklab, ${color} 70%, transparent)`,
                    }
                  : { color: "var(--muted-foreground)" }
              }
            >
              {option === "expense" ? t("tx.expense") : t("tx.income")}
            </button>
          );
        })}
      </div>

      <div className="mt-5 text-center">
        <p className="text-muted-foreground text-[11px] tracking-widest uppercase">
          {t("tx.amount")}
        </p>
        <label
          className="mt-2 flex items-baseline justify-center gap-2 rounded-2xl border border-transparent py-1"
          style={invalidRing(!amountValid)}
        >
          <span className="text-muted-foreground text-xl font-medium">Rp</span>
          <input
            inputMode="numeric"
            value={groupDigits(digits)}
            onChange={(e) => setDigits(sanitizeAmountDigits(e.target.value))}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Amount in rupiah"
            aria-invalid={!amountValid && touched}
            className="w-full max-w-[70%] bg-transparent text-center text-[2.2rem] leading-none font-semibold tracking-tight tabular-nums outline-none"
            style={{ color: amount > 0 ? accent : "var(--foreground)" }}
          />
        </label>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold tracking-tight">
          {t("tx.walletSource")} <span style={{ color: "var(--destructive)" }}>*</span>
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={t("tx.walletSource")}>
          {accounts.map((option) => (
            <Chip
              key={option.id}
              active={walletId === option.id}
              onClick={() => selectWallet(option.id)}
            >
              {option.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold tracking-tight">
          {t("tx.category")} <span style={{ color: "var(--destructive)" }}>*</span>
        </p>
        <div className="mt-2.5 grid grid-cols-4 gap-2" role="group" aria-label={t("tx.category")}>
          {visibleCategories.map((item) => {
            const Icon = iconMap[item.icon];
            const isActive = categoryId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => pickCategory(item.id, item.name)}
                aria-pressed={isActive}
                className="glass tap flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1.5 py-3 text-center transition-colors duration-200"
                style={
                  isActive
                    ? {
                        borderColor: accent,
                        boxShadow: `0 0 16px -3px color-mix(in oklab, ${accent} 75%, transparent)`,
                      }
                    : invalidRing(!category)
                }
              >
                <Icon
                  className="size-[18px]"
                  strokeWidth={1.9}
                  style={isActive ? { color: accent } : undefined}
                />
                <span className="text-[10px] leading-tight break-words">{item.name}</span>
              </button>
            );
          })}
          {visibleCategories.length === 0 && (
            <p
              data-testid="tx-empty-categories"
              className="text-muted-foreground col-span-4 text-[11px] leading-relaxed"
            >
              {kind === "expense" && isShopeePayWallet(selectedWallet) ? (
                <>
                  Belum ada kategori untuk Expense + ShopeePay. Buat kategori dulu di{" "}
                  <button
                    type="button"
                    data-testid="tx-empty-categories-link"
                    onClick={() => setCategoryManagerOpen(true)}
                    className="tap text-primary font-semibold underline underline-offset-2"
                  >
                    Pengaturan / Settings
                  </button>
                </>
              ) : (
                t("tx.noCategories")
              )}
            </p>
          )}

        </div>

        {/* Expense: category always starts empty. */}
        {kind === "expense" && (
          <p
            data-testid="tx-create-category-hint"
            className="text-muted-foreground mt-2 text-[11px] leading-relaxed"
          >
            Silakan pilih atau buat kategori terlebih dahulu di{" "}
            <button
              type="button"
              data-testid="tx-create-category-link"
              onClick={() => setCategoryManagerOpen(true)}
              className="tap text-primary font-semibold underline underline-offset-2"
            >
              Pengaturan / Settings
            </button>
          </p>
        )}

        {/* Income + Shopee Pay: Driver COD is pre-selected. */}
        {isShopeeIncome && (
          <p
            data-testid="tx-driver-cod-default-hint"
            className="text-muted-foreground mt-2 text-[11px] leading-relaxed"
          >
            Kategori ShopeePay: Driver COD
          </p>
        )}


        {touched && !categoryId && (
          <p
            role="alert"
            data-testid="tx-category-required"
            className="mt-1.5 text-[11px] font-medium"
            style={{ color: "var(--destructive)" }}
          >
            {t("tx.categoryRequired")}
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <label className="glass rounded-2xl px-3.5 py-2.5">
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            {t("tx.note")}
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("tx.optional")}
            className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
          />
        </label>
        <label className="glass rounded-2xl px-3.5 py-2.5">
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            {t("tx.date")}
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full bg-transparent text-sm outline-none [color-scheme:dark]"
          />
        </label>
      </div>

      {touched && missing.length > 0 && (
        <p
          role="alert"
          aria-live="assertive"
          className="animate-fade-in mt-3 text-center text-[11px] font-medium"
          style={{ color: "var(--destructive)" }}
        >
          {t("tx.missingPrefix")} {missing.join(", ")} {t("tx.missingSuffix")}
        </p>
      )}

      {cashNeeded && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cod-cash-title"
          aria-describedby="cod-cash-body"
          data-testid="cod-cash-required"
          className="glass animate-fade-in mt-3 rounded-2xl p-3.5"
        >
          <p id="cod-cash-title" className="text-sm font-semibold tracking-tight">
            {t("cod.cashNeededTitle")}
          </p>
          <p id="cod-cash-body" className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
            {t("cod.cashNeededBody")}
          </p>
          <div className="mt-3">
            <button
              type="button"
              autoFocus
              onClick={() => setCashNeeded(false)}
              className="tap glass w-full rounded-full px-3 py-2 text-[12px] font-semibold"
            >
              {t("cod.cashNeededCta")}
            </button>
          </div>
        </div>
      )}

      {codConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cod-confirm-title"
          aria-describedby="cod-confirm-body"
          data-testid="cod-confirm"
          className="glass animate-fade-in mt-3 rounded-2xl p-3.5"
        >
          <p id="cod-confirm-title" className="text-sm font-semibold tracking-tight">
            {t("cod.confirmTitle")}
          </p>
          <p
            id="cod-confirm-body"
            className="text-muted-foreground mt-1 text-[11px] leading-relaxed"
          >
            {t("cod.confirmBody")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setCodConfirm(false)}
              className="tap glass flex-1 rounded-full px-3 py-2 text-[12px] font-semibold"
            >
              {t("cod.cancel")}
            </button>
            <button
              type="button"
              onClick={commit}
              className="tap flex-1 rounded-full px-3 py-2 text-[12px] font-semibold"
              style={{ backgroundColor: "var(--expense)", color: "var(--background)" }}
            >
              {t("cod.confirm")}
            </button>
          </div>
        </div>
      )}

      <div onClick={() => !canSave && setTouched(true)} className="pb-4">
        <PrimaryButton disabled={!canSave} onClick={handleSave}>
          {submitting && !saved ? (
            t("err.saving")
          ) : saved ? (
            <>
              <Check className="animate-scale-in size-5" strokeWidth={2.4} /> {t("tx.saved")}
            </>
          ) : (
            t("tx.save")
          )}
        </PrimaryButton>
      </div>

      <CategoryManagerSheet
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        walletId={selectedWallet?.type === "Custom" ? selectedWallet.id : null}
      />
    </Sheet>
  );
}
