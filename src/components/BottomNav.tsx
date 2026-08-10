import { Link } from "@tanstack/react-router";
import { BarChart3, Home, Plus, Settings, Wallet } from "lucide-react";
import { useState, type ComponentType } from "react";

import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { useT, type TranslationKey } from "@/lib/i18n";

type NavItem = {
  label: string;
  labelKey: TranslationKey;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  to?: "/" | "/analytics" | "/wallets" | "/settings";
};

const navItems: NavItem[] = [
  { label: "Home", labelKey: "nav.home", Icon: Home, to: "/" },
  { label: "Analytics", labelKey: "nav.analytics", Icon: BarChart3, to: "/analytics" },
  { label: "Wallets", labelKey: "nav.wallets", Icon: Wallet, to: "/wallets" },
  { label: "Settings", labelKey: "nav.settings", Icon: Settings, to: "/settings" },
];

function itemClasses(isActive: boolean) {
  return `tap flex flex-col items-center gap-0.5 rounded-2xl py-1.5 ${
    isActive ? "text-foreground" : "text-muted-foreground"
  }`;
}

function ItemContent({ labelKey, Icon, isActive }: NavItem & { isActive: boolean }) {
  const { t } = useT();
  return (
    <>
      <Icon className="size-[18px]" strokeWidth={isActive ? 2.2 : 1.9} />
      <span className="text-[10px]">{t(labelKey)}</span>
      {isActive && (
        <span className="bg-primary shadow-primary mt-0.5 size-1 rounded-full shadow-[0_0_6px]" />
      )}
    </>
  );
}

function NavButton({ item, active }: { item: NavItem; active: string }) {
  const isActive = active === item.label;
  if (item.to) {
    return (
      <Link
        to={item.to}
        aria-current={isActive ? "page" : undefined}
        className={itemClasses(isActive)}
      >
        <ItemContent {...item} isActive={isActive} />
      </Link>
    );
  }
  return (
    <button className={itemClasses(isActive)}>
      <ItemContent {...item} isActive={isActive} />
    </button>
  );
}

export function BottomNav({ active, flow = false }: { active: string; flow?: boolean }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();

  return (
    <>
      <nav
        className={
          flow
            ? "safe-bottom z-20 mx-auto w-full max-w-md shrink-0 pt-1.5"
            : "safe-bottom-4 fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md px-5"
        }
      >
        <div className="glass grid grid-cols-5 items-center rounded-3xl p-1.5">
          {navItems.slice(0, 2).map((item) => (
            <NavButton key={item.label} item={item} active={active} />
          ))}

          <button
            aria-label={t("nav.add")}
            onClick={() => setOpen(true)}
            className="tap from-primary to-primary-foreground/40 text-primary-foreground shadow-primary/25 mx-auto flex size-12 items-center justify-center rounded-full bg-gradient-to-br shadow-lg"
          >
            <Plus className="size-6" strokeWidth={2.2} />
          </button>

          {navItems.slice(2).map((item) => (
            <NavButton key={item.label} item={item} active={active} />
          ))}
        </div>
      </nav>

      <AddTransactionSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
