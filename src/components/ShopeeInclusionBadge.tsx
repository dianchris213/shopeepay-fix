import { Info } from "lucide-react";

import { shopeePayAccount, useFinance } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

/**
 * Makes the Total Balance rule visible: the persistent Shopee Pay wallet is a
 * debt tracker, so it only counts toward the total while its balance is
 * positive. Without this indicator the total silently disagrees with the
 * wallet list.
 */
export function ShopeeInclusionBadge({ className = "" }: { className?: string }) {
  const state = useFinance();
  const { t } = useT();
  const driver = shopeePayAccount(state);
  if (!driver) return null;

  const included = driver.amount > 0;
  const color = included ? "var(--income)" : "var(--expense)";

  const hint = included ? t("shopee.includedHint") : t("shopee.excludedHint");

  return (
    <span
      data-testid="shopee-inclusion-badge"
      data-included={included ? "true" : "false"}
      // The colour alone carries the include/exclude meaning visually, so the
      // full rule is exposed as text to assistive tech, not just as a tooltip.
      role="status"
      aria-label={hint}
      title={hint}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${className}`}

      style={{
        color,
        borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
      }}
    >
      <Info className="size-3 shrink-0" strokeWidth={1.9} aria-hidden />
      <span className="truncate">
        {included ? t("shopee.includedBadge") : t("shopee.excludedBadge")}
      </span>
    </span>
  );
}
