import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Chip, PrimaryButton, Sheet } from "@/components/Sheet";
import { accountIconKeys, iconFor } from "@/lib/icon-map";
import {
  deleteAccount,
  updateAccount,
  useFinance,
  useMoney,
  walletNameTaken,
  type Account,
  type AccountType,
} from "@/lib/finance-store";
import { useT } from "@/lib/i18n";
import { reportMutation } from "@/lib/mutation-feedback";
import { toast } from "@/lib/toast-store";

type Props = { open: boolean; onClose: () => void };

const types: AccountType[] = ["Bank Account", "E-Wallet", "Cash", "Custom"];

export function ManageWalletsSheet({ open, onClose }: Props) {
  const { accounts } = useFinance();
  const money = useMoney();
  const { t, lang } = useT();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("Bank Account");
  const [icon, setIcon] = useState("bank");
  const [note, setNote] = useState("");

  const deleting = accounts.find((a) => a.id === pendingDelete) ?? null;
  const editing = accounts.find((a) => a.id === editingId) ?? null;
  const combined = accounts.reduce((sum, a) => sum + a.amount, 0);

  const trimmed = name.trim();
  const duplicate = !!editingId && trimmed.length > 0 && walletNameTaken(trimmed, editingId);
  const canSave = trimmed.length > 0 && !duplicate;

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setType(editing.type);
    setIcon(editing.icon);
    setNote(editing.sub);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(account: Account) {
    setEditingId(account.id);
  }

  function saveEdit() {
    if (!editingId || !canSave) return;
    const result = updateAccount(editingId, {
      name: trimmed,
      type,
      icon,
      sub:
        note.trim() ||
        (type === "Cash" ? "On Hand" : type === "Custom" ? "Custom tracking" : "Linked account"),
    });
    if (reportMutation(result, "wallet", lang, "toast.walletUpdated")) setEditingId(null);
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t("mw.title")}>
        <p className="text-muted-foreground mt-4 text-xs">
          {t("mw.combined")}{" "}
          <span className="text-foreground font-semibold tabular-nums">{money(combined)}</span>{" "}
          {t("mw.across")} {accounts.length} {t("mw.accounts")}.
        </p>

        <ul className="mt-4 space-y-2.5 pb-4">
          {accounts.map((account) => {
            const Icon = iconFor(account.icon);
            return (
              <li
                key={account.id}
                className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${account.color} 18%, transparent)`,
                    color: account.color,
                  }}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="text-muted-foreground truncate text-[11px]">
                    {account.type} · {money(account.amount)}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(account)}
                  aria-label={`${t("mw.edit")}: ${account.name}`}
                  className="tap glass text-muted-foreground hover:text-primary grid size-9 shrink-0 place-items-center rounded-full"
                >
                  <Pencil className="size-4" strokeWidth={1.8} />
                </button>
                <button
                  onClick={() => setPendingDelete(account.id)}
                  aria-label={`Delete ${account.name}`}
                  className="tap glass text-muted-foreground hover:text-expense grid size-9 shrink-0 place-items-center rounded-full"
                >
                  <Trash2 className="size-4" strokeWidth={1.8} />
                </button>
              </li>
            );
          })}
          {accounts.length === 0 && (
            <li className="glass text-muted-foreground rounded-2xl px-3.5 py-6 text-center text-xs">
              {t("mw.empty")}
            </li>
          )}
        </ul>
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditingId(null)} title={t("mw.editTitle")}>
        {editing && (
          <div className="pb-4">
            <label className="glass mt-4 block rounded-2xl px-3.5 py-2.5">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("mw.name")}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
              />
            </label>
            {duplicate && (
              <p role="alert" className="text-expense mt-2 text-[11px] font-medium">
                {t("vd.dupWalletBody")}
              </p>
            )}

            <p className="mt-4 text-xs font-semibold tracking-tight">{t("wa.type")}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {types.map((option) => (
                <Chip key={option} active={option === type} onClick={() => setType(option)}>
                  {option}
                </Chip>
              ))}
            </div>

            <p className="mt-4 text-xs font-semibold tracking-tight">{t("wa.icon")}</p>
            <div className="mt-2.5 grid grid-cols-6 gap-1.5">
              {accountIconKeys.map((key) => {
                const Icon = iconFor(key);
                const active = key === icon;
                return (
                  <button
                    key={key}
                    onClick={() => setIcon(key)}
                    aria-label={key}
                    aria-pressed={active}
                    className={`tap grid aspect-square place-items-center rounded-xl transition-colors duration-200 ${
                      active ? "bg-primary/25 text-foreground" : "glass text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" strokeWidth={1.9} />
                  </button>
                );
              })}
            </div>

            <label className="glass mt-4 block rounded-2xl px-3.5 py-2.5">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("wa.label")}
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("wa.notePlaceholder")}
                className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
              />
            </label>

            <p className="text-muted-foreground mt-4 text-[11px]">
              {t("mw.balance")}:{" "}
              <span className="text-foreground font-semibold tabular-nums">
                {money(editing.amount)}
              </span>
            </p>

            <PrimaryButton disabled={!canSave} onClick={saveEdit}>
              {t("mw.save")}
            </PrimaryButton>
          </div>
        )}
      </Sheet>

      <ConfirmDeleteDialog
        open={!!deleting}
        title={t("mw.deleteTitle")}
        detail={deleting ? `${deleting.name} · ${money(deleting.amount)}` : undefined}
        description={t("mw.deleteBody")}
        confirmLabel={t("mw.deleteConfirm")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteAccount(deleting.id);
          toast.success(t("toast.walletDeleted"));
          setPendingDelete(null);
        }}
      />
    </>
  );
}
