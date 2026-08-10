import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Sparkles } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

import { BottomNav } from "@/components/BottomNav";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { AllTransactionsSheet } from "@/components/AllTransactionsSheet";
import { iconFor } from "@/lib/icon-map";
import { useFinance, useMoney } from "@/lib/finance-store";
import { customLabel, streamSummary, streamsCsv, type StreamKey } from "@/lib/streams";
import { useT } from "@/lib/i18n";
import { loadUiState, saveUiState } from "@/lib/ui-state";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — C2H KEUANGAN" },
      {
        name: "description",
        content:
          "See weekly, monthly and yearly spending trends, total spent and your top expense categories at a glance.",
      },
      { property: "og:title", content: "Analytics — C2H KEUANGAN" },
      {
        property: "og:description",
        content:
          "See weekly, monthly and yearly spending trends, total spent and your top expense categories at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analytics,
});

const ranges = ["This Month", "Last Month", "Last 3 Months", "Custom Range"] as const;
type RangeKey = (typeof ranges)[number];

const rangeLabelKeys = {
  "This Month": "an.thisMonth",
  "Last Month": "an.lastMonth",
  "Last 3 Months": "an.last3Months",
  "Custom Range": "an.customRange",
} as const;

const palette = [
  "var(--chart-1)",
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-3)",
];

const DAY_MS = 86_400_000;

/** One point on the spending trend chart, including tooltip detail. */
type TrendPoint = { label: string; scope: string; count: number; value: number };

function toInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Parses a `yyyy-mm-dd` input value; returns null for empty/malformed values. */
function startOfDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const time = new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime();
  return Number.isNaN(time) ? null : time;
}

function endOfDay(value: string) {
  const start = startOfDay(value);
  return start === null ? null : start + DAY_MS - 1;
}

/** Inclusive [start, end] for the current local month. */
function currentMonthWindow(now: Date) {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1,
  };
}

/** Resolve the selected option into an inclusive [start, end] timestamp window. */
function resolveWindow(range: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  if (range === "Custom Range") {
    const start = startOfDay(customFrom);
    const end = endOfDay(customTo);
    // A cleared date input must not collapse the window into NaN.
    if (start === null || end === null) return currentMonthWindow(now);
    return end >= start ? { start, end } : { start: end - DAY_MS + 1, end: start + DAY_MS - 1 };
  }
  if (range === "Last Month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
    return { start, end };
  }
  const monthsBack = range === "Last 3 Months" ? 2 : 0;
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
  return { start, end };
}

function Analytics() {
  const state = useFinance();
  const { transactions } = state;
  const money = useMoney();
  const { t } = useT();
  const [range, setRange] = useState<RangeKey>("This Month");
  const today = new Date();
  const [customFrom, setCustomFrom] = useState(
    toInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [customTo, setCustomTo] = useState(toInputValue(today));

  /** Which stream the user tapped to drill into, scoped to the active range. */
  const [drill, setDrill] = useState<StreamKey | null>(null);
  // Index of the trend point selected via keyboard/tap (a11y tooltip mirror).
  const [activeTrend, setActiveTrend] = useState<number | null>(null);

  /**
   * Range + drill selection survive closing the drill-down sheet (and leaving
   * the screen entirely). Restored after mount so SSR markup stays stable.
   */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = loadUiState<{
      range: RangeKey;
      customFrom: string;
      customTo: string;
      drill: StreamKey | null;
    }>("analytics", { range, customFrom, customTo, drill: null });
    if (ranges.includes(saved.range)) setRange(saved.range);
    if (saved.customFrom) setCustomFrom(saved.customFrom);
    if (saved.customTo) setCustomTo(saved.customTo);
    if (saved.drill === "driver" || saved.drill === "custom") setDrill(saved.drill);
    setRestored(true);
    // Restore once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveUiState("analytics", { range, customFrom, customTo, drill });
  }, [restored, range, customFrom, customTo, drill]);

  const streams = useMemo(() => {
    const { start, end } = resolveWindow(range, customFrom, customTo);
    return {
      driver: streamSummary(state, "driver", start, end),
      custom: streamSummary(state, "custom", start, end),
      customName: customLabel(state),
      start,
      end,
    };
  }, [state, range, customFrom, customTo]);

  function exportCsv() {
    const csv = streamsCsv(state, streams.start, streams.end);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `streams-${toInputValue(new Date(streams.start))}-to-${toInputValue(
      new Date(streams.end),
    )}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const { trend, totalSpent, totalIncome, netFlow, categories, delta, hasAnyData, windowLabel } =
    useMemo(() => {
      const { start, end } = resolveWindow(range, customFrom, customTo);
      const spanMs = Math.max(end - start + 1, DAY_MS);
      const days = Math.round(spanMs / DAY_MS);
      const count = Math.min(12, Math.max(4, Math.ceil(days / 7)));

      const inRange = (date: string) => {
        const time = new Date(date).getTime();
        return time >= start && time <= end;
      };

      const expenses = transactions.filter((tx) => tx.amount < 0);
      const incomes = transactions.filter((tx) => tx.amount > 0);
      const inWindow = expenses.filter((tx) => inRange(tx.date));
      const incomeInWindow = incomes.filter((tx) => inRange(tx.date));
      const previous = expenses.filter((tx) => {
        const time = new Date(tx.date).getTime();
        return time >= start - spanMs && time < start;
      });

      const bucketSize = spanMs / count;
      const dayLabel = (time: number) =>
        new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const series = Array.from({ length: count }, (_, i) => {
        const bucketStart = start + bucketSize * i;
        const bucketEnd = Math.min(end, bucketStart + bucketSize - 1);
        return {
          label: dayLabel(bucketStart),
          // Exact scope of the bucket, surfaced in the chart tooltip.
          scope:
            dayLabel(bucketStart) === dayLabel(bucketEnd)
              ? dayLabel(bucketStart)
              : `${dayLabel(bucketStart)} – ${dayLabel(bucketEnd)}`,
          count: 0,
          value: 0,
        };
      });

      for (const tx of inWindow) {
        const index = Math.min(
          count - 1,
          Math.max(0, Math.floor((new Date(tx.date).getTime() - start) / bucketSize)),
        );
        series[index]!.value += Math.abs(tx.amount);
        series[index]!.count += 1;
      }

      const total = inWindow.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const prevTotal = previous.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const byCategory = new Map<string, { amount: number; icon: string }>();
      for (const tx of inWindow) {
        const entry = byCategory.get(tx.category) ?? { amount: 0, icon: tx.icon };
        entry.amount += Math.abs(tx.amount);
        byCategory.set(tx.category, entry);
      }
      const cats = [...byCategory.entries()]
        .map(([name, v], i) => ({
          name,
          amount: v.amount,
          icon: v.icon,
          color: palette[i % palette.length]!,
          percent: total > 0 ? Math.round((v.amount / total) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const income = incomeInWindow.reduce((sum, tx) => sum + tx.amount, 0);
      const fmt = (time: number) =>
        new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return {
        trend: series,
        totalSpent: total,
        totalIncome: income,
        netFlow: income - total,
        categories: cats,
        delta: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0,
        hasAnyData: inWindow.length > 0 || incomeInWindow.length > 0,
        windowLabel: `${fmt(start)} – ${fmt(end)}`,
      };
    }, [transactions, range, customFrom, customTo]);

  const improving = delta <= 0;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden px-5 pt-6 pb-28">
      <header>
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          {t("an.insights")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("an.title")}</h1>

        <div
          role="group"
          aria-label={t("an.range")}
          data-testid="range-toggle"
          className="glass mt-4 grid grid-cols-2 gap-1 rounded-3xl p-1"
        >
          {ranges.map((option) => {
            const isActive = option === range;
            return (
              <button
                key={option}
                onClick={() => setRange(option)}
                aria-pressed={isActive}
                className={`tap rounded-2xl py-2 text-[11px] font-medium transition-colors duration-200 ${
                  isActive
                    ? "bg-primary/20 text-foreground shadow-primary/40 shadow-[0_0_16px]"
                    : "text-muted-foreground"
                }`}
              >
                {t(rangeLabelKeys[option])}
              </button>
            );
          })}
        </div>

        {range === "Custom Range" && (
          <div className="animate-fade-in mt-2.5 grid grid-cols-2 gap-2">
            <label className="glass rounded-2xl px-3.5 py-2">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("an.startDate")}
              </span>
              <input
                type="date"
                value={customFrom}
                max={customTo}
                aria-label={t("an.startDate")}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-0.5 w-full bg-transparent text-xs outline-none"
              />
            </label>
            <label className="glass rounded-2xl px-3.5 py-2">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("an.endDate")}
              </span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                aria-label={t("an.endDate")}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-0.5 w-full bg-transparent text-xs outline-none"
              />
            </label>
          </div>
        )}

        <p className="text-muted-foreground mt-2.5 text-[11px] tabular-nums">{windowLabel}</p>
      </header>

      <WidgetErrorBoundary name="analytics-summary">
        <section className="glass-hero animate-fade-in mt-6 rounded-3xl p-6">
          <p className="text-muted-foreground text-xs tracking-widest uppercase">
            {t("an.totalSpent")}
          </p>
          <p
            data-testid="an-total-spent"
            className="mt-2 text-[2.4rem] leading-none font-semibold tracking-tight tabular-nums"
          >
            {money(totalSpent)}
          </p>
          <span
            data-testid="an-delta"
            className={`mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-[0_0_14px] ${
              improving
                ? "bg-income/15 text-income shadow-income/25"
                : "bg-expense/15 text-expense shadow-expense/25"
            }`}
          >
            {improving ? (
              <ArrowDownRight className="size-3.5" strokeWidth={2.2} />
            ) : (
              <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
            )}
            {Math.abs(delta)}% {t("an.vsPrevious")}
          </span>

          <dl className="border-border/60 mt-5 grid grid-cols-3 gap-2 border-t pt-4">
            <div>
              <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("an.income")}
              </dt>
              <dd
                data-testid="an-income"
                className="text-income mt-1 text-sm font-semibold tabular-nums"
              >
                {money(totalIncome)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("an.expenses")}
              </dt>
              <dd
                data-testid="an-expenses"
                className="text-expense mt-1 text-sm font-semibold tabular-nums"
              >
                {money(totalSpent)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("an.netFlow")}
              </dt>
              <dd
                data-testid="an-netflow"
                className={`mt-1 text-sm font-semibold tabular-nums ${
                  netFlow >= 0 ? "text-income" : "text-expense"
                }`}
              >
                {netFlow < 0 ? "-" : ""}
                {money(Math.abs(netFlow))}
              </dd>
            </div>
          </dl>
        </section>
      </WidgetErrorBoundary>

      {!hasAnyData && (
        <section className="glass animate-fade-in mt-6 rounded-3xl px-5 py-8 text-center">
          <span className="bg-primary/15 text-primary mx-auto grid size-12 place-items-center rounded-full">
            <Sparkles className="size-5" strokeWidth={1.8} />
          </span>
          <h2 className="mt-3 text-sm font-semibold tracking-tight">{t("an.emptyTitle")}</h2>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed">
            {t("an.emptyBody")}
          </p>
        </section>
      )}

      <WidgetErrorBoundary name="analytics-streams">
        <section className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{t("an.streams")}</h2>
            <button
              onClick={exportCsv}
              disabled={streams.driver.count === 0 && streams.custom.count === 0}
              className="glass tap text-muted-foreground flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
            >
              <Download className="size-3.5" strokeWidth={1.9} />
              {t("an.exportCsv")}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {[
              { key: "driver" as StreamKey, label: t("an.driverStream"), data: streams.driver },
              { key: "custom" as StreamKey, label: streams.customName, data: streams.custom },
            ].map(({ key, label, data }) => {
              const max = Math.max(data.income, data.expense, 1);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDrill(key)}
                  aria-label={`${label} — ${t("an.viewEntries")}`}
                  className="glass tap animate-fade-in rounded-2xl px-3.5 py-3 text-left"
                >
                  <p className="truncate text-xs font-semibold tracking-tight">{label}</p>
                  <p className="text-muted-foreground text-[10px] tabular-nums">
                    {data.count} {t("an.entries")}
                  </p>
                  <dl className="mt-2 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t("an.income")}</dt>
                      <dd className="text-income font-semibold tabular-nums">
                        {money(data.income)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t("an.expenses")}</dt>
                      <dd className="text-expense font-semibold tabular-nums">
                        {money(data.expense)}
                      </dd>
                    </div>
                    <div className="border-border/60 flex items-center justify-between gap-2 border-t pt-1">
                      <dt className="text-muted-foreground">{t("an.net")}</dt>
                      <dd
                        className={`font-semibold tabular-nums ${
                          data.net >= 0 ? "text-income" : "text-expense"
                        }`}
                      >
                        {data.net < 0 ? "-" : ""}
                        {money(Math.abs(data.net))}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-2.5 space-y-1">
                    <div className="bg-secondary/70 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-income h-full rounded-full"
                        style={{ width: `${(data.income / max) * 100}%` }}
                      />
                    </div>
                    <div className="bg-secondary/70 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-expense h-full rounded-full"
                        style={{ width: `${(data.expense / max) * 100}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-muted-foreground mt-2 text-[10px] font-medium">
                    {t("an.viewEntries")} →
                  </p>
                </button>
              );
            })}
          </div>
          {streams.driver.count === 0 && streams.custom.count === 0 && (
            <p className="text-muted-foreground mt-2 text-center text-[11px]">
              {t("an.streamsEmpty")}
            </p>
          )}
        </section>
      </WidgetErrorBoundary>

      <WidgetErrorBoundary name="analytics-trend">
        <section className="glass mt-6 rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">{t("an.trend")}</h2>
            <span className="text-muted-foreground text-[11px]">{t(rangeLabelKeys[range])}</span>
          </div>

          <div className="mt-4 h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-border)"
                  strokeDasharray="3 6"
                />
                <Tooltip
                  cursor={{ stroke: "var(--chart-1)", strokeOpacity: 0.35 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0]!.payload as TrendPoint;
                    return (
                      <div
                        data-testid="trend-tooltip"
                        className="glass rounded-2xl px-3 py-2 text-[11px] shadow-lg"
                      >
                        <p className="text-muted-foreground tracking-wide uppercase">
                          {point.scope}
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums">
                          {money(point.value)}
                        </p>
                        <p className="text-muted-foreground mt-0.5 tabular-nums">
                          {point.count}{" "}
                          {point.count === 1 ? t("an.transaction") : t("an.transactions")} ·{" "}
                          {t("an.spent")}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#spendGradient)"
                  dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  animationDuration={250}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Keyboard/screen-reader equivalent of the hover tooltip: each x-axis
            label is focusable and announces the same three facts (total,
            transaction count, date scope) that the visual tooltip shows. */}
          <div
            role="group"
            aria-label={t("an.trend")}
            className="text-muted-foreground mt-2 flex justify-between gap-0.5 text-center text-[10px]"
          >
            {trend.map((point, i) => {
              const countLabel = `${point.count} ${
                point.count === 1 ? t("an.transaction") : t("an.transactions")
              }`;
              const active = activeTrend === i;
              return (
                <button
                  key={`${point.label}-${i}`}
                  type="button"
                  data-testid="trend-point"
                  aria-pressed={active}
                  aria-label={`${point.scope}: ${money(point.value)} ${t("an.spent")}, ${countLabel}`}
                  onClick={() => setActiveTrend(active ? null : i)}
                  onFocus={() => setActiveTrend(i)}
                  className={`tap min-h-11 min-w-0 flex-1 rounded-lg px-0.5 transition-colors duration-200 ${
                    active ? "bg-primary/15 text-foreground" : ""
                  }`}
                >
                  <span className="block truncate">{point.label}</span>
                </button>
              );
            })}
          </div>
          <p
            role="status"
            aria-live="polite"
            data-testid="trend-readout"
            className="text-muted-foreground mt-1 text-[11px]"
          >
            {activeTrend !== null && trend[activeTrend]
              ? `${trend[activeTrend]!.scope}: ${money(trend[activeTrend]!.value)} ${t("an.spent")} · ${
                  trend[activeTrend]!.count
                } ${trend[activeTrend]!.count === 1 ? t("an.transaction") : t("an.transactions")}`
              : t("an.trendPointHint")}
          </p>
        </section>
      </WidgetErrorBoundary>

      <WidgetErrorBoundary name="analytics-categories">
        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-tight">{t("an.topCategories")}</h2>

          <ul className="mt-3 space-y-2.5">
            {categories.map(({ name, amount, percent, icon, color }) => {
              const Icon = iconFor(icon);
              return (
                <li key={name} className="glass animate-fade-in rounded-2xl px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                        color,
                      }}
                    >
                      <Icon className="size-[18px]" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-muted-foreground text-[11px] tabular-nums">
                        {percent}% {t("an.ofTotal")}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">{money(amount)}</p>
                  </div>
                  <div className="bg-secondary/70 mt-3 h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: color,
                        boxShadow: `0 0 10px ${color}`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
            {categories.length === 0 && (
              <li className="glass text-muted-foreground rounded-2xl px-3.5 py-6 text-center text-xs">
                {t("an.emptyPeriod")}
              </li>
            )}
          </ul>
        </section>
      </WidgetErrorBoundary>

      <AllTransactionsSheet
        open={drill !== null}
        onClose={() => setDrill(null)}
        stream={drill}
        persistKey={drill ? `drill.${drill}` : undefined}
        title={drill === "custom" ? streams.customName : undefined}
        initialFrom={toInputValue(new Date(streams.start))}
        initialTo={toInputValue(new Date(streams.end))}
      />

      <BottomNav active="Analytics" />
    </div>
  );
}
