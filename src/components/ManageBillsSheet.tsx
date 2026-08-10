import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Repeat, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { AmountField, PrimaryButton, Sheet } from "@/components/Sheet";
import { iconFor } from "@/lib/icon-map";
import {
  addBill,
  billNameTaken,
  deleteBill,
  dueLabel,
  moveBill,
  nextMonthOf,
  updateBill,
  useFinance,
  useMoney,
  type Bill,
} from "@/lib/finance-store";
import { useT } from "@/lib/i18n";
import { reportMutation } from "@/lib/mutation-feedback";
import { toast } from "@/lib/toast-store";

type Props = { open: boolean; onClose: () => void };

const billIconKeys = ["bills", "bike", "zap", "water", "home", "card", "phone"];

export function ManageBillsSheet({ open, onClose }: Props) {
  const { bills } = useFinance();
  const money = useMoney();
  const { t, lang } = useT();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [icon, setIcon] = useState("bills");
  const [isRecurring, setIsRecurring] = useState(true);
  const [confirmRepeat, setConfirmRepeat] = useState(false);
  const [repeatError, setRepeatError] = useState(false);

  const deleting = bills.find((b) => b.id === pendingDelete) ?? null;
  const amount = Number(digits || 0);
  const trimmed = name.trim();
  const duplicate = trimmed.length > 0 && billNameTaken(trimmed, editingId ?? undefined);
  const valid = trimmed.length > 0 && amount > 0 && !duplicate;

  function reset() {
    setEditingId(null);
    setName("");
    setDigits("");
    setDueDate("");
    setIcon("bills");
    setIsRecurring(true);
    setRepeatError(false);
    setConfirmRepeat(false);
  }

  function startEdit(bill: Bill) {
    setEditingId(bill.id);
    setName(bill.name);
    setDigits(String(Math.round(bill.amount)));
    setDueDate(bill.dueDate ?? "");
    setIcon(bill.icon);
    setIsRecurring(bill.isRecurring ?? false);
    setRepeatError(false);
    setAdding(true);
  }

  /** Recurring bills need a due date so the roll-forward has an anchor. */
  function toggleRecurring() {
    if (isRecurring) {
      setIsRecurring(false);
      setRepeatError(false);
      return;
    }
    if (!dueDate) {
      setRepeatError(true);
      return;
    }
    setRepeatError(false);
    setConfirmRepeat(true);
  }

  function submit() {
    if (!valid) return;
    if (isRecurring && !dueDate) {
      setRepeatError(true);
      return;
    }
    const result = editingId
      ? updateBill(editingId, {
          name: trimmed,
          amount,
          ...(dueDate ? { dueDate } : {}),
          icon,
          isRecurring,
        })
      : addBill({
          name: trimmed,
          amount,
          dueDate: dueDate || undefined,
          icon,
          isRecurring,
        });

    if (!reportMutation(result, "bill", lang, editingId ? "toast.billUpdated" : "toast.billAdded"))
      return;
    reset();
    setAdding(false);
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t("bills.title")}>
        <p className="text-muted-foreground mt-4 text-xs">{t("bills.orderHint")}</p>

        <button
          onClick={() => setAdding(true)}
          className="glass tap mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium"
        >
          <Plus className="size-4" strokeWidth={2} />
          {t("bills.add")}
        </button>

        <ul className="mt-4 space-y-2.5 pb-4">
          {bills.map((bill, index) => {
            const Icon = iconFor(bill.icon);
            const label = dueLabel(bill.dueDate);
            return (
              <li key={bill.id} className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3">
                <span className="bg-primary/15 text-primary grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                  {index + 1}
                </span>
                <span className="bg-secondary text-foreground grid size-9 shrink-0 place-items-center rounded-full">
                  <Icon className="size-[16px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{bill.name}</p>
                  <p
                    className="text-muted-foreground truncate text-[11px] tabular-nums"
                    suppressHydrationWarning
                  >
                    {money(bill.amount)}
                    {label ? ` · ${label}` : ""}
                  </p>
                  {bill.isRecurring && (
                    <span className="text-primary mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium">
                      <Repeat className="size-3" strokeWidth={2} />
                      {t("bills.repeat")}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => moveBill(bill.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${bill.name} up`}
                    className="tap glass text-muted-foreground grid size-8 place-items-center rounded-full disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => moveBill(bill.id, 1)}
                    disabled={index === bills.length - 1}
                    aria-label={`Move ${bill.name} down`}
                    className="tap glass text-muted-foreground grid size-8 place-items-center rounded-full disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => startEdit(bill)}
                    aria-label={`${t("bills.edit")}: ${bill.name}`}
                    className="tap glass text-muted-foreground hover:text-primary grid size-8 place-items-center rounded-full"
                  >
                    <Pencil className="size-3.5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => setPendingDelete(bill.id)}
                    aria-label={`Delete ${bill.name}`}
                    className="tap glass text-muted-foreground hover:text-expense grid size-8 place-items-center rounded-full"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              </li>
            );
          })}
          {bills.length === 0 && (
            <li className="glass text-muted-foreground rounded-2xl px-3.5 py-6 text-center text-xs">
              {t("bills.empty")}
            </li>
          )}
        </ul>
      </Sheet>

      <Sheet
        open={adding}
        onClose={() => {
          reset();
          setAdding(false);
        }}
        title={editingId ? t("bills.editTitle") : t("bills.addTitle")}
      >
        <AmountField digits={digits} onDigits={setDigits} accent="var(--expense)" />

        <p className="mt-4 text-xs font-semibold tracking-tight">{t("bills.name")}</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("bills.namePlaceholder")}
          className="glass mt-2 w-full rounded-2xl px-3.5 py-3 text-sm outline-none"
        />

        <p className="mt-4 text-xs font-semibold tracking-tight">{t("bills.dueDate")}</p>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            if (e.target.value) setRepeatError(false);
          }}
          className="glass mt-2 w-full rounded-2xl px-3.5 py-3 text-sm outline-none"
        />

        <p className="mt-4 text-xs font-semibold tracking-tight">{t("bills.icon")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {billIconKeys.map((key) => {
            const Icon = iconFor(key);
            return (
              <button
                key={key}
                onClick={() => setIcon(key)}
                aria-label={key}
                aria-pressed={icon === key}
                className={`tap grid size-10 place-items-center rounded-full transition-colors duration-200 ${
                  icon === key
                    ? "bg-primary/20 text-foreground shadow-primary/40 shadow-[0_0_16px]"
                    : "glass text-muted-foreground"
                }`}
              >
                <Icon className="size-4" strokeWidth={1.8} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isRecurring}
          onClick={toggleRecurring}
          className="glass tap mt-4 flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
        >
          <span className="bg-primary/15 text-primary grid size-9 shrink-0 place-items-center rounded-full">
            <Repeat className="size-4" strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t("bills.repeat")}</span>
            <span className="text-muted-foreground block text-[11px]">{t("bills.repeatSub")}</span>
            {isRecurring && dueDate && (
              <span className="text-primary mt-0.5 block text-[11px] tabular-nums">
                {t("bills.repeatNextDue")}: {nextMonthOf(dueDate)}
              </span>
            )}
          </span>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
              isRecurring ? "bg-primary" : "bg-secondary/70"
            }`}
          >
            <span
              className={`bg-foreground inline-block size-5 rounded-full transition-transform duration-200 ${
                isRecurring ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>

        {duplicate && (
          <p role="alert" className="text-expense mt-2 text-[11px] font-medium">
            {t("vd.dupBillBody")}
          </p>
        )}

        {repeatError && (
          <p className="text-expense mt-2 text-[11px]">{t("bills.repeatNeedsDate")}</p>
        )}

        <div className="pb-4">
          <PrimaryButton disabled={!valid} onClick={submit}>
            {t("bills.save")}
          </PrimaryButton>
        </div>
      </Sheet>

      <Sheet
        open={confirmRepeat}
        onClose={() => setConfirmRepeat(false)}
        title={t("bills.confirmRepeatTitle")}
      >
        <div className="pb-2">
          <p className="text-muted-foreground mt-4 text-sm">{t("bills.confirmRepeatBody")}</p>
          {dueDate && (
            <p className="text-primary mt-3 text-sm tabular-nums">
              {t("bills.repeatNextDue")}: {nextMonthOf(dueDate)}
            </p>
          )}
          <PrimaryButton
            onClick={() => {
              setIsRecurring(true);
              setConfirmRepeat(false);
            }}
          >
            {t("bills.confirmRepeat")}
          </PrimaryButton>
          <button
            onClick={() => setConfirmRepeat(false)}
            className="tap text-muted-foreground mt-3 w-full rounded-2xl py-3 text-sm font-medium"
          >
            {t("common.cancel")}
          </button>
        </div>
      </Sheet>

      <ConfirmDeleteDialog
        open={!!deleting}
        title={t("bills.deleteTitle")}
        detail={deleting ? `${deleting.name} · ${money(deleting.amount)}` : undefined}
        description={t("bills.deleteBody")}
        confirmLabel={t("bills.deleteConfirm")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteBill(deleting.id);
          toast.success(t("toast.billDeleted"));
          setPendingDelete(null);
        }}
      />
    </>
  );
}
