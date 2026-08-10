import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { AmountField, Chip, PrimaryButton, Sheet } from "@/components/Sheet";
import { accountIconKeys, iconFor } from "@/lib/icon-map";
import {
  addAccount,
  walletNameTaken,
  topUpAccount,
  transferBetweenAccounts,
  useFinance,
  useMoney,
  type AccountType,
} from "@/lib/finance-store";
import { reportMutation } from "@/lib/mutation-feedback";
import { useT } from "@/lib/i18n";

type Props = { open: boolean; onClose: () => void };

export function TransferSheet({ open, onClose }: Props) {
  const { accounts } = useFinance();
  const money = useMoney();
  const { t, lang } = useT();
  const [digits, setDigits] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDigits("");
    setDone(false);
    setFromId(accounts[0]?.id ?? "");
    setToId(accounts[1]?.id ?? "");
  }, [open, accounts]);

  const amount = Number(digits || 0);
  const from = accounts.find((a) => a.id === fromId);
  const valid = amount > 0 && !!from && !!toId && fromId !== toId && amount <= from.amount && !done;

  function submit() {
    if (!valid) return;
    if (!reportMutation(transferBetweenAccounts(fromId, toId, amount), "wallet", lang)) return;
    setDone(true);
    window.setTimeout(onClose, 520);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("wa.transferTitle")}>
      <AmountField digits={digits} onDigits={setDigits} accent="var(--primary)" />

      <p className="mt-4 text-xs font-semibold tracking-tight">{t("wa.from")}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Chip
            key={a.id}
            active={a.id === fromId}
            onClick={() => {
              setFromId(a.id);
              if (a.id === toId) setToId(accounts.find((x) => x.id !== a.id)?.id ?? "");
            }}
          >
            {a.name}
          </Chip>
        ))}
      </div>

      <p className="mt-4 text-xs font-semibold tracking-tight">{t("wa.to")}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {accounts
          .filter((a) => a.id !== fromId)
          .map((a) => (
            <Chip key={a.id} active={a.id === toId} onClick={() => setToId(a.id)}>
              {a.name}
            </Chip>
          ))}
      </div>

      <p className="text-muted-foreground mt-3 text-[11px]">
        {from ? `${from.name} ${t("wa.balance")}: ` : ""}
        <span className="tabular-nums">{money(from?.amount ?? 0)}</span>
      </p>
      {!!from && amount > from.amount && (
        <p className="text-expense mt-1 text-[11px] font-medium">{t("wa.insufficient")}</p>
      )}

      <PrimaryButton disabled={!valid} onClick={submit}>
        {done ? (
          <>
            <Check className="animate-scale-in size-5" strokeWidth={2.4} /> {t("wa.transferred")}
          </>
        ) : (
          t("wa.transferNow")
        )}
      </PrimaryButton>
    </Sheet>
  );
}

const sources = ["Bank Transfer", "Debit Card", "Cash Deposit"];

export function TopUpSheet({ open, onClose }: Props) {
  const { accounts } = useFinance();
  const { t, lang } = useT();
  const [digits, setDigits] = useState("");
  const [accountId, setAccountId] = useState("");
  const [source, setSource] = useState(sources[0]!);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDigits("");
    setDone(false);
    setSource(sources[0]!);
    setAccountId(accounts[0]?.id ?? "");
  }, [open, accounts]);

  const amount = Number(digits || 0);
  const valid = amount > 0 && !!accountId && !done;

  function submit() {
    if (!valid) return;
    if (!reportMutation(topUpAccount(accountId, amount, source), "wallet", lang)) return;
    setDone(true);
    window.setTimeout(onClose, 520);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("wa.topUpTitle")}>
      <AmountField digits={digits} onDigits={setDigits} accent="var(--income)" />

      <p className="mt-4 text-xs font-semibold tracking-tight">{t("wa.destination")}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Chip key={a.id} active={a.id === accountId} onClick={() => setAccountId(a.id)}>
            {a.name}
          </Chip>
        ))}
      </div>

      <p className="mt-4 text-xs font-semibold tracking-tight">{t("wa.fundingSource")}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {sources.map((s) => (
          <Chip key={s} active={s === source} onClick={() => setSource(s)}>
            {s}
          </Chip>
        ))}
      </div>

      <PrimaryButton disabled={!valid} onClick={submit}>
        {done ? (
          <>
            <Check className="animate-scale-in size-5" strokeWidth={2.4} /> {t("wa.toppedUp")}
          </>
        ) : (
          t("wa.topUpConfirm")
        )}
      </PrimaryButton>
    </Sheet>
  );
}

const types: AccountType[] = ["Bank Account", "E-Wallet", "Cash", "Custom"];

export function AddAccountSheet({ open, onClose }: Props) {
  const { t, lang } = useT();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("Bank Account");
  const [digits, setDigits] = useState("");
  const [icon, setIcon] = useState<string>("bank");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setType("Bank Account");
    setDigits("");
    setIcon("bank");
    setNote("");
    setDone(false);
  }, [open]);

  const trimmed = name.trim();
  const duplicate = trimmed.length > 0 && walletNameTaken(trimmed);
  const valid = trimmed.length > 0 && !duplicate && !done;

  function submit() {
    if (!valid) return;
    const result = addAccount({
      name: trimmed,
      type,
      // Only the Custom type registers a starting nominal.
      amount: type === "Custom" ? Number(digits || 0) : 0,
      sub:
        note.trim() ||
        (type === "Cash" ? "On Hand" : type === "Custom" ? "Custom tracking" : "Linked account"),
      icon,
    });
    if (!reportMutation(result, "wallet", lang, "toast.walletAdded")) return;
    setDone(true);
    window.setTimeout(onClose, 520);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("wa.addTitle")}>
      <label className="glass mt-4 block rounded-2xl px-3.5 py-2.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {t("wa.accountName")}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("wa.namePlaceholder")}
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

      {/* Nominal (initial balance) is only meaningful for a Custom account —
          it mirrors the "uang ibu" flow, where the wallet starts with a
          registered amount instead of being built up from transactions. */}
      {type === "Custom" && (
        <>
          <AmountField
            digits={digits}
            onDigits={setDigits}
            accent="var(--income)"
            label={t("wa.startingBalance")}
          />
          <p className="text-muted-foreground mt-2 text-[11px]">{t("wa.nominalHint")}</p>
        </>
      )}

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

      <PrimaryButton disabled={!valid} onClick={submit}>
        {done ? (
          <>
            <Check className="animate-scale-in size-5" strokeWidth={2.4} /> {t("wa.added")}
          </>
        ) : (
          t("wa.create")
        )}
      </PrimaryButton>
    </Sheet>
  );
}
