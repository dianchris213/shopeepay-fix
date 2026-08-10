import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  CloudCheck,
  Download,
  FolderTree,
  HelpCircle,
  Languages,
  Loader2,
  LogOut,
  Moon,
  Pencil,
  Receipt,
  KeyRound,
  ServerCog,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { CategoryManagerSheet } from "@/components/CategoryManagerSheet";
import { ChangePasswordSheet } from "@/components/ChangePasswordSheet";
import { ManageBillsSheet } from "@/components/ManageBillsSheet";
import { ManageWalletsSheet } from "@/components/ManageWalletsSheet";
import { PinSetupSheet } from "@/components/PinSetupSheet";
import { ProfileSheet } from "@/components/ProfileSheet";
import { Sheet } from "@/components/Sheet";
import { SyncStatusPanel } from "@/components/SyncStatusPanel";
import { SystemStatusSheet } from "@/components/SystemStatusSheet";
import { ShopeePaySheet } from "@/components/ShopeePaySheet";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import {
  exportData,
  shopeePayAccount,
  updateSettings,
  useFinance,
  useMoney,
  type Language,
} from "@/lib/finance-store";
import { languageLabels, useT } from "@/lib/i18n";
import { runAccountDeletion } from "@/lib/delete-account-flow";
import { toast } from "@/lib/toast-store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — C2H KEUANGAN" },
      {
        name: "description",
        content:
          "Choose your language and theme, manage security, cloud auto-save and your C2H KEUANGAN account.",
      },
      { property: "og:title", content: "Settings — C2H KEUANGAN" },
      {
        property: "og:description",
        content:
          "Choose your language and theme, manage security, cloud auto-save and your C2H KEUANGAN account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`tap relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-primary" : "bg-secondary/70"
      }`}
    >
      <span
        className={`bg-foreground inline-block size-5 rounded-full shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Section({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section className="mt-6">
      <h2
        className={`text-xs font-semibold tracking-widest uppercase ${
          tone === "danger" ? "text-expense" : "text-muted-foreground"
        }`}
      >
        {title}
      </h2>
      <div
        className={`glass mt-3 overflow-hidden rounded-3xl ${
          tone === "danger" ? "border-expense/40 ring-expense/15 ring-1" : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  sub,
  Icon,
  children,
  onClick,
  tone = "default",
}: {
  label: string;
  sub?: string;
  Icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children?: React.ReactNode;
  onClick?: () => void;
  tone?: "default" | "danger" | "success";
}) {
  const iconTone =
    tone === "danger"
      ? "bg-expense/15 text-expense"
      : tone === "success"
        ? "bg-income/15 text-income"
        : "bg-primary/15 text-primary";
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 ${onClick ? "tap cursor-pointer" : ""}`}
    >
      {Icon && (
        <span className={`grid size-10 place-items-center rounded-full ${iconTone}`}>
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${tone === "danger" ? "text-expense" : ""}`}>{label}</p>
        {sub && <p className="text-muted-foreground text-[11px]">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="bg-border/70 mx-4 h-px" />;
}

function SettingsPage() {
  const state = useFinance();
  const { profile, settings } = state;
  const money = useMoney();
  const shopeeBalance = shopeePayAccount(state)?.amount ?? 0;
  const { t, lang } = useT();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [shopeeOpen, setShopeeOpen] = useState(false);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isLight = settings.theme === "light";

  function handleBiometric(next: boolean) {
    if (next) {
      setPinOpen(true);
      return;
    }
    updateSettings({ biometricLock: false, pinSet: false });
  }

  async function confirmDelete() {
    await runAccountDeletion(
      {
        deleteAccount: () => deleteMyAccount() as Promise<{ ok?: boolean } | undefined>,
        signOut: () => supabase.auth.signOut(),
        clearLocalData: () => {
          window.localStorage.removeItem("c2h.finance.v1");
          window.localStorage.removeItem("c2h.categories.v1");
        },
        redirect: () => {
          window.location.href = "/";
        },
        setBusy: setDeleting,
        setError: setDeleteError,
        lang,
      },
      deleting,
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden px-5 pt-6 pb-28">
      <header>
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          {t("settings.configuration")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
      </header>

      <section className="glass-hero animate-fade-in mt-6 rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <span className="relative">
            <span className="from-primary to-primary-foreground/40 text-primary-foreground grid size-14 place-items-center rounded-full bg-gradient-to-br text-lg font-semibold">
              {profile.avatar}
            </span>
            <span className="bg-background border-border absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full border">
              <span className="size-3 rounded-full bg-[oklch(0.75_0.18_145)] shadow-[0_0_8px_oklch(0.75_0.18_145/60)]" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-lg font-semibold tracking-tight">{profile.name}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.75_0.18_145/15%)] px-2 py-0.5 text-[10px] font-medium text-[oklch(0.62_0.16_150)]">
                <span className="size-1.5 rounded-full bg-[oklch(0.7_0.18_148)]" />
                {t("settings.verified")}
              </span>
            </div>
            <p className="text-muted-foreground text-[11px]">{t("settings.member")}</p>
          </div>
          <button
            onClick={() => setProfileOpen(true)}
            className="glass tap text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium"
          >
            <Pencil className="size-3.5" strokeWidth={1.9} />
            {t("settings.edit")}
          </button>
        </div>
      </section>

      <Section title={t("settings.preferences")}>
        <Row
          label={t("settings.language")}
          sub={languageLabels[lang]}
          Icon={Languages}
          onClick={() => setLanguageOpen(true)}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        <Row
          label={t("settings.theme")}
          sub={isLight ? t("settings.themeLight") : t("settings.themeDark")}
          Icon={isLight ? Sun : Moon}
        >
          <Toggle
            checked={!isLight}
            onChange={(dark) => updateSettings({ theme: dark ? "dark" : "light" })}
            ariaLabel={t("settings.theme")}
          />
        </Row>
        <Divider />
        <Row label={t("settings.reduceMotion")} sub={t("settings.reduceMotionSub")} Icon={Sparkles}>
          <Toggle
            checked={settings.reduceMotion}
            onChange={(v) => updateSettings({ reduceMotion: v })}
            ariaLabel={t("settings.reduceMotion")}
          />
        </Row>
        <Divider />
        <Row
          label={t("settings.currency")}
          sub={settings.currency === "IDR" ? "IDR (Rp)" : "USD ($)"}
          Icon={Smartphone}
          onClick={() => updateSettings({ currency: settings.currency === "IDR" ? "USD" : "IDR" })}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        <Row
          label={t("settings.categories")}
          sub={t("settings.categoriesSub")}
          Icon={FolderTree}
          onClick={() => setCategoriesOpen(true)}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        {/* Persistent ShopeeFood driver balance — editable at any time. */}
        <Row
          label={t("settings.shopee")}
          sub={t("settings.shopeeSub")}
          Icon={Wallet}
          tone={shopeeBalance < 0 ? "danger" : "success"}
          onClick={() => setShopeeOpen(true)}
        >
          <span
            className={`text-xs font-semibold tabular-nums ${
              shopeeBalance < 0 ? "text-expense" : "text-income"
            }`}
          >
            {money(shopeeBalance)}
          </span>
        </Row>
        <Divider />
        <Row
          label={t("settings.wallets")}
          sub={t("settings.walletsSub")}
          Icon={Wallet}
          onClick={() => setWalletsOpen(true)}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        <Row
          label={t("settings.bills")}
          sub={t("settings.billsSub")}
          Icon={Receipt}
          onClick={() => setBillsOpen(true)}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        <Row label={t("settings.push")} sub={t("settings.pushSub")} Icon={Bell}>
          <Toggle
            checked={settings.pushNotifications}
            onChange={(v) => updateSettings({ pushNotifications: v })}
            ariaLabel={t("settings.push")}
          />
        </Row>
      </Section>

      <Section title={t("settings.security")}>
        <Row
          label={t("settings.passcode")}
          sub={settings.pinSet ? t("settings.passcodeOn") : t("settings.passcodeOff")}
          Icon={Shield}
        >
          <Toggle
            checked={settings.biometricLock}
            onChange={handleBiometric}
            ariaLabel={t("settings.passcode")}
          />
        </Row>
        <Divider />
        <Row
          label={t("settings.changePassword")}
          sub={t("settings.changePasswordSub")}
          Icon={KeyRound}
          onClick={() => setPasswordOpen(true)}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        <Row
          label={t("settings.export")}
          sub={t("settings.exportSub")}
          Icon={Download}
          onClick={() => setExportOpen(true)}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        <Row
          label={t("settings.autoSave")}
          sub={t("settings.autoSaveSub")}
          Icon={CloudCheck}
          tone="success"
        >
          <span className="bg-income/15 text-income grid size-6 place-items-center rounded-full">
            <Check className="size-3.5" strokeWidth={2.6} />
          </span>
        </Row>
      </Section>

      <Section title={t("sync.section")}>
        <SyncStatusPanel />
      </Section>

      <Section title={t("settings.about")}>
        <Row label={t("settings.version")} sub="v1.0.0 Pro" Icon={Settings} />
        <Divider />
        <Row
          label={t("settings.help")}
          sub={t("settings.helpSub")}
          Icon={HelpCircle}
          onClick={() => window.open("https://docs.lovable.dev", "_blank", "noopener,noreferrer")}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
        <Divider />
        <Row
          label={t("settings.signOut")}
          sub={t("settings.signOutSub")}
          Icon={LogOut}
          onClick={() => {
            void supabase.auth.signOut();
          }}
        >
          <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.8} />
        </Row>
      </Section>

      <section className="mt-6">
        <h2 className="text-muted-foreground font-mono text-[10px] tracking-[0.3em] uppercase">
          {t("settings.developer")}
        </h2>
        <button
          onClick={() => setSystemOpen(true)}
          className="glass tap mt-3 flex w-full items-center gap-3 rounded-3xl px-4 py-3.5 text-left transition-colors duration-200"
        >
          <span className="bg-income/12 relative grid size-10 shrink-0 place-items-center rounded-full">
            <ServerCog className="text-income size-[18px]" strokeWidth={1.8} />
            <span className="bg-income absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-sm font-medium tracking-tight">
              {t("settings.systemStatus")}
            </span>
            <span className="text-muted-foreground block text-[11px]">
              {t("settings.systemStatusSub")}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" strokeWidth={1.8} />
        </button>
      </section>

      <Section title={t("settings.danger")} tone="danger">
        <Row
          label={t("settings.deleteAccount")}
          sub={t("settings.deleteAccountSub")}
          Icon={Trash2}
          tone="danger"
          onClick={() => setDeleteOpen(true)}
        >
          <ChevronRight className="text-expense size-4" strokeWidth={1.8} />
        </Row>
      </Section>

      <ManageWalletsSheet open={walletsOpen} onClose={() => setWalletsOpen(false)} />
      <ChangePasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <ManageBillsSheet open={billsOpen} onClose={() => setBillsOpen(false)} />
      <ShopeePaySheet open={shopeeOpen} onClose={() => setShopeeOpen(false)} />
      <CategoryManagerSheet open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SystemStatusSheet open={systemOpen} onClose={() => setSystemOpen(false)} />
      <PinSetupSheet
        open={pinOpen}
        onCancel={() => setPinOpen(false)}
        onComplete={() => {
          updateSettings({ biometricLock: true, pinSet: true });
          setPinOpen(false);
        }}
      />

      <Sheet
        open={languageOpen}
        onClose={() => setLanguageOpen(false)}
        title={t("settings.chooseLanguage")}
      >
        <div className="mt-4 space-y-2.5 pb-4">
          {(Object.keys(languageLabels) as Language[]).map((code) => {
            const active = code === lang;
            return (
              <button
                key={code}
                onClick={() => {
                  updateSettings({ language: code });
                  setLanguageOpen(false);
                }}
                className={`tap flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors duration-200 ${
                  active ? "bg-primary/15 ring-primary/40 ring-1" : "glass"
                }`}
              >
                <span className="bg-secondary/70 grid size-9 place-items-center rounded-full text-[11px] font-semibold uppercase">
                  {code}
                </span>
                <span className="flex-1 text-sm font-medium">{languageLabels[code]}</span>
                {active && (
                  <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-full">
                    <Check className="size-3.5" strokeWidth={2.6} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>

      <Sheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={t("settings.exportTitle")}
      >
        <p className="text-muted-foreground mt-4 text-xs">{t("settings.exportHint")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 pb-4">
          {(["csv", "json"] as const).map((format) => (
            <button
              key={format}
              onClick={() => {
                exportData(format);
                setExportOpen(false);
              }}
              className="glass tap flex flex-col items-center gap-2 rounded-2xl px-3 py-5"
            >
              <Download className="text-primary size-5" strokeWidth={1.9} />
              <span className="text-sm font-semibold uppercase">{format}</span>
              <span className="text-muted-foreground text-[10px]">
                {format === "csv" ? t("settings.exportCsv") : t("settings.exportJson")}
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={deleteOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteError(null);
          setDeleteOpen(false);
        }}
        title={t("settings.deleteTitle")}
      >
        <div className="pb-4">
          <div className="border-expense/40 bg-expense/10 mt-4 flex gap-3 rounded-2xl border p-4">
            <TriangleAlert className="text-expense mt-0.5 size-5 shrink-0" strokeWidth={2} />
            <p className="text-expense text-xs leading-relaxed">{t("settings.deleteBody")}</p>
          </div>
          {deleteError && (
            <p className="text-expense mt-3 text-xs" role="alert">
              {deleteError}
            </p>
          )}
          <button
            onClick={() => void confirmDelete()}
            disabled={deleting}
            className="tap bg-expense text-background mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-60"
          >
            {deleting && <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />}
            {deleting ? t("settings.deleting") : t("settings.deleteConfirm")}
          </button>
          <button
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(false);
            }}
            disabled={deleting}
            className="tap text-muted-foreground mt-2 w-full rounded-2xl py-3 text-sm font-medium"
          >
            {t("settings.cancel")}
          </button>
        </div>
      </Sheet>

      <BottomNav active="Settings" />
    </div>
  );
}
