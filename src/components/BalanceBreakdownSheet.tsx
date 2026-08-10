import { Sheet } from "@/components/Sheet";
import { ShopeeInclusionBadge } from "@/components/ShopeeInclusionBadge";
import { iconFor } from "@/lib/icon-map";
import { totalBalance, useFinance, useMoney } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

type Props = { open: boolean; onClose: () => void };

export function BalanceBreakdownSheet({ open, onClose }: Props) {
  const state = useFinance();
  const { accounts, reserve } = state;
  const money = useMoney();
  const { t } = useT();
  // Mirrors the home total: a non-positive Shopee Pay balance stays isolated.
  const total = totalBalance(state);


  return (
    <Sheet open={open} onClose={onClose} title={t("bb.title")}>
      <div className="glass-hero mt-4 rounded-3xl p-5">
        <p className="text-muted-foreground text-[11px] tracking-widest uppercase">
          {t("home.totalBalance")}
        </p>
        <p className="mt-1.5 text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {money(total)}
        </p>
        <div className="mt-2">
          <ShopeeInclusionBadge />
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {accounts.map((account) => {
          const Icon = iconFor(account.icon);
          const share = total > 0 ? Math.round((account.amount / total) * 100) : 0;
          return (
            <li key={account.id} className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3">
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
                  {account.type} · {share}%
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">{money(account.amount)}</p>
            </li>
          );
        })}
      </ul>

      <div className="glass mt-2.5 mb-4 flex items-center justify-between rounded-2xl px-3.5 py-3">
        <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {t("bb.reserveNote")}
        </p>
        <p className="text-sm font-semibold tabular-nums">{money(reserve)}</p>
      </div>
    </Sheet>
  );
}
