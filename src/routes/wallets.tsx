import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus, PlusCircle } from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { Chip } from "@/components/Sheet";
import { AddAccountSheet, TopUpSheet, TransferSheet } from "@/components/WalletActionSheets";
import { iconFor } from "@/lib/icon-map";
import { relativeDate, useFinance, useMoney } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/wallets")({
  head: () => ({
    meta: [
      { title: "My Wallets — C2H KEUANGAN" },
      {
        name: "description",
        content:
          "Manage bank accounts, e-wallets and cash in one place. See your combined balance, transfer between wallets and review activity per account.",
      },
      { property: "og:title", content: "My Wallets — C2H KEUANGAN" },
      {
        property: "og:description",
        content:
          "Manage bank accounts, e-wallets and cash in one place. See your combined balance, transfer between wallets and review activity per account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Wallets,
});

function Wallets() {
  const { accounts, transactions } = useFinance();
  const money = useMoney();
  const { t } = useT();
  const [filter, setFilter] = useState("All Accounts");
  const [sheet, setSheet] = useState<null | "transfer" | "topup" | "add">(null);

  const combined = useMemo(() => accounts.reduce((sum, a) => sum + a.amount, 0), [accounts]);
  const filters = ["All Accounts", ...accounts.map((a) => a.name)];
  const filterLabel = (name: string) => (name === "All Accounts" ? t("wl.allAccounts") : name);
  const visible =
    filter === "All Accounts" ? transactions : transactions.filter((t) => t.via === filter);

  const quickActions = [
    {
      label: t("wl.transfer"),
      sub: t("wl.transferSub"),
      Icon: ArrowLeftRight,
      action: () => setSheet("transfer"),
    },
    {
      label: t("wl.topUp"),
      sub: t("wl.topUpSub"),
      Icon: PlusCircle,
      action: () => setSheet("topup"),
    },
    {
      label: t("wl.addAccount"),
      sub: t("wl.addAccountSub"),
      Icon: Plus,
      action: () => setSheet("add"),
    },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden px-5 pt-6 pb-28">
      <header>
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          {t("wallets.accounts")}
        </p>
        <h1 className="truncate text-2xl font-semibold tracking-tight">{t("wallets.title")}</h1>
      </header>

      <section className="glass-hero animate-fade-in mt-6 rounded-3xl p-6">
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          {t("wallets.combined")}
        </p>
        <p className="mt-2 text-[2.4rem] leading-none font-semibold tracking-tight tabular-nums">
          {money(combined)}
        </p>
        <p className="text-muted-foreground mt-3 text-[11px]">
          {t("wallets.across").replace("{n}", String(accounts.length))}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight">{t("wallets.yourAccounts")}</h2>
        <ul className="mt-3 space-y-2.5">
          {accounts.map((account) => {
            const Icon = iconFor(account.icon);
            return (
              <li key={account.id}>
                <div className="glass flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5">
                  <button
                    onClick={() => setFilter(account.name)}
                    className="tap flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-full"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${account.color} 18%, transparent)`,
                        color: account.color,
                      }}
                    >
                      <Icon className="size-[18px]" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{account.name}</p>
                      <p className="text-muted-foreground truncate text-[11px]">{account.sub}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{money(account.amount)}</p>
                      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                        {account.type}
                      </p>
                    </div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-2.5">
        {quickActions.map(({ label, sub, Icon, action }) => (
          <button
            key={label}
            onClick={action}
            className="glass tap flex flex-col items-center gap-2 rounded-2xl px-2 py-3.5 text-center"
          >
            <span className="bg-primary/15 text-primary shadow-primary/25 grid size-9 place-items-center rounded-full shadow-[0_0_14px]">
              <Icon className="size-[17px]" strokeWidth={1.9} />
            </span>
            <span className="text-[11px] leading-tight font-medium">{label}</span>
            <span className="text-muted-foreground text-[9px] leading-tight">{sub}</span>
          </button>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">{t("wallets.activity")}</h2>
          <span className="text-muted-foreground text-[11px]">{filter}</span>
        </div>

        <div className="no-scrollbar -mx-5 mt-3 overflow-x-auto px-5">
          <div className="flex w-max gap-2">
            {filters.map((option) => (
              <Chip key={option} active={option === filter} onClick={() => setFilter(option)}>
                {filterLabel(option)}
              </Chip>
            ))}
          </div>
        </div>

        <ul className="mt-3 space-y-2.5">
          {visible.map((tx) => {
            const Icon = iconFor(tx.icon);
            return (
              <li key={tx.id} className="glass animate-fade-in rounded-2xl px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <span className="bg-secondary/70 text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full">
                    <Icon className="size-[18px]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tx.name}</p>
                    <p
                      className="text-muted-foreground truncate text-[11px]"
                      suppressHydrationWarning
                    >
                      {relativeDate(tx.date)} · via {tx.via}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      tx.amount < 0 ? "text-expense" : "text-income"
                    }`}
                  >
                    {tx.amount < 0 ? "-" : "+"}
                    {money(Math.abs(tx.amount))}
                  </p>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="glass text-muted-foreground rounded-2xl px-3.5 py-6 text-center text-xs">
              No activity for {filter} yet.
            </li>
          )}
        </ul>
      </section>

      <TransferSheet open={sheet === "transfer"} onClose={() => setSheet(null)} />
      <TopUpSheet open={sheet === "topup"} onClose={() => setSheet(null)} />
      <AddAccountSheet open={sheet === "add"} onClose={() => setSheet(null)} />

      <BottomNav active="Wallets" />
    </div>
  );
}
