import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, HardDrive, RefreshCw, Users } from "lucide-react";

import { Sheet } from "@/components/Sheet";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

type Stats = {
  total_users: number;
  total_transactions: number;
  total_wallets: number;
  total_bills: number;
};

async function fetchStats(): Promise<Stats> {
  const { data, error } = await supabase.rpc("app_stats");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Stats | undefined;
  return {
    total_users: Number(row?.total_users ?? 0),
    total_transactions: Number(row?.total_transactions ?? 0),
    total_wallets: Number(row?.total_wallets ?? 0),
    total_bills: Number(row?.total_bills ?? 0),
  };
}

function localCacheSize() {
  if (typeof window === "undefined") return "—";
  let bytes = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      bytes += key.length + (window.localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    return "—";
  }
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

function StatCard({
  label,
  value,
  hint,
  Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="glass animate-fade-in rounded-2xl px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[10px] tracking-widest uppercase">{label}</p>
        <Icon className="text-primary size-3.5" strokeWidth={1.9} />
      </div>
      <p className="mt-2 font-mono text-xl leading-none font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-1.5 text-[10px]">{hint}</p>}
    </div>
  );
}

export function SystemStatusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const [spinning, setSpinning] = useState(false);
  const query = useQuery({
    queryKey: ["system-status"],
    queryFn: fetchStats,
    enabled: open,
    staleTime: 30_000,
  });
  const cache = useMemo(() => (open ? localCacheSize() : "—"), [open, query.dataUpdatedAt]);

  const online = !query.isError;
  const dot = online ? "oklch(0.75 0.18 145)" : "var(--destructive)";

  async function refresh() {
    if (spinning) return;
    setSpinning(true);
    await query.refetch();
    window.setTimeout(() => setSpinning(false), 400);
  }

  const fmt = (n?: number) => (n === undefined ? "···" : n.toLocaleString("id-ID"));

  return (
    <Sheet open={open} onClose={onClose} title={t("sys.title")}>
      <div className="glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3.5">
        <span className="relative grid size-10 place-items-center rounded-full bg-[oklch(0.75_0.18_145/12%)]">
          <Database className="size-[18px] text-[oklch(0.75_0.18_145)]" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-widest uppercase opacity-70">
            {t("sys.serverStatus")}
          </p>
          <p className="text-sm font-medium">{t("sys.cloudDb")}</p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
          style={{ backgroundColor: `color-mix(in oklab, ${dot} 14%, transparent)`, color: dot }}
        >
          <span
            className="size-1.5 animate-pulse rounded-full"
            style={{ backgroundColor: dot, boxShadow: `0 0 8px ${dot}` }}
          />
          {online ? t("sys.online") : t("sys.offline")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <StatCard
          label={t("sys.users")}
          value={fmt(query.data?.total_users)}
          hint={t("sys.usersHint")}
          Icon={Users}
        />
        <StatCard
          label={t("sys.rows")}
          value={fmt(query.data?.total_transactions)}
          hint={t("sys.rowsHint")}
          Icon={Activity}
        />
        <StatCard
          label={t("sys.walletsBills")}
          value={`${fmt(query.data?.total_wallets)} / ${fmt(query.data?.total_bills)}`}
          hint={t("sys.walletsBillsHint")}
          Icon={Database}
        />
        <StatCard label={t("sys.cache")} value={cache} hint={t("sys.cacheHint")} Icon={HardDrive} />
      </div>

      <button
        onClick={refresh}
        className="glass tap mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-semibold transition-colors duration-200"
      >
        <RefreshCw
          className={`size-4 transition-transform duration-[600ms] ease-out ${
            spinning || query.isFetching ? "animate-spin" : ""
          }`}
          strokeWidth={2}
        />
        {t("sys.refresh")}
      </button>

      <p className="text-muted-foreground mt-3 mb-4 rounded-2xl border border-dashed border-[var(--border)] px-4 py-3 text-[10px] leading-relaxed">
        {t("sys.note")}
      </p>
    </Sheet>
  );
}
