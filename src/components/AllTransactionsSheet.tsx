import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Search, SlidersHorizontal, Trash2, X } from "lucide-react";

import { AmountField, Chip, PrimaryButton, Sheet } from "@/components/Sheet";
import { useCategories } from "@/lib/categories-store";
import { iconFor } from "@/lib/icon-map";
import {
  deleteTransaction,
  relativeDate,
  updateTransaction,
  useFinance,
  useMoney,
  type Transaction,
} from "@/lib/finance-store";
import { reportMutation } from "@/lib/mutation-feedback";
import { useT, type TranslationKey } from "@/lib/i18n";
import { isCustomTx, isDriverTx, type StreamKey } from "@/lib/streams";
import { loadUiState, saveUiState } from "@/lib/ui-state";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Restrict the list to a specialised stream (DriverShopee / custom wallets). */
  stream?: StreamKey | null | undefined;
  /** Optional heading override, e.g. the custom wallet's own name. */
  title?: string | undefined;
  /** Preselect a custom date range (yyyy-mm-dd) — used by analytics drill-down. */
  initialFrom?: string | undefined;
  initialTo?: string | undefined;
  /** When set, the chosen filters are remembered across close/reopen. */
  persistKey?: string | undefined;
};

type PersistedFilters = {
  typeFilter: TypeFilter;
  range: RangeFilter;
  from: string;
  to: string;
  wallets: string[];
  cats: string[];
};

const DURATION = 250;

type TypeFilter = "all" | "expense" | "income" | "transfer" | "topup";
type RangeFilter = "all" | "this" | "last" | "custom";

const TYPE_PILLS: { key: TypeFilter; label: TranslationKey }[] = [
  { key: "all", label: "at.all" },
  { key: "expense", label: "at.expenses" },
  { key: "income", label: "at.incomes" },
  { key: "transfer", label: "at.transfers" },
  { key: "topup", label: "at.topups" },
];

const RANGE_PILLS: { key: RangeFilter; label: TranslationKey }[] = [
  { key: "all", label: "at.allTime" },
  { key: "this", label: "at.thisMonth" },
  { key: "last", label: "at.lastMonth" },
  { key: "custom", label: "at.custom" },
];

function typeOf(tx: Transaction): TypeFilter {
  if (tx.category === "Transfer") return "transfer";
  if (tx.category === "Top Up") return "topup";
  return tx.amount > 0 ? "income" : "expense";
}

function kindLabel(tx: Transaction) {
  if (tx.category === "Transfer") {
    if (tx.name.startsWith("Transfer to")) {
      return `Transfer from ${tx.via} to ${tx.name.replace("Transfer to ", "")}`;
    }
    return `Transfer from ${tx.name.replace("Transfer from ", "")} to ${tx.via}`;
  }
  if (tx.category === "Top Up") {
    return `Top Up via ${tx.via}`;
  }
  return tx.name;
}

function badgeFor(tx: Transaction) {
  if (tx.category === "Transfer") return "Transfer";
  if (tx.category === "Top Up") return "Top Up";
  if (tx.category === "Reserve") return "Reserve";
  return tx.amount > 0 ? "Income" : "Expense";
}

export function AllTransactionsSheet({
  open,
  onClose,
  stream = null,
  title,
  initialFrom,
  initialTo,
  persistKey,
}: Props) {
  const { t, lang } = useT();
  const state = useFinance();
  const money = useMoney();
  const categories = useCategories();

  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [confirming, setConfirming] = useState<Transaction | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [range, setRange] = useState<RangeFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [wallets, setWallets] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);

  const [digits, setDigits] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [note, setNote] = useState("");

  const defaults: PersistedFilters = {
    typeFilter: "all",
    // A drill-down opens pre-scoped to the period the user tapped.
    range: initialFrom || initialTo ? "custom" : "all",
    from: initialFrom ?? "",
    to: initialTo ?? "",
    wallets: [],
    cats: [],
  };

  function applyFilters(next: PersistedFilters) {
    setTypeFilter(next.typeFilter);
    setRange(next.range);
    setFrom(next.from);
    setTo(next.to);
    setWallets(next.wallets);
    setCats(next.cats);
  }

  function resetFilters() {
    setQuery("");
    applyFilters(defaults);
    if (persistKey) saveUiState(persistKey, defaults);
  }

  /** Reopen with whatever the user last picked for this sheet, if remembered. */
  function restoreFilters() {
    setQuery("");
    applyFilters(persistKey ? loadUiState<PersistedFilters>(persistKey, defaults) : defaults);
  }

  const activeFilters =
    (typeFilter !== "all" ? 1 : 0) +
    (range !== "all" ? 1 : 0) +
    (wallets.length ? 1 : 0) +
    (cats.length ? 1 : 0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      restoreFilters();
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), DURATION);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Remember the active filter set while the sheet is open.
  useEffect(() => {
    if (!open || !persistKey) return;
    saveUiState<PersistedFilters>(persistKey, { typeFilter, range, from, to, wallets, cats });
  }, [open, persistKey, typeFilter, range, from, to, wallets, cats]);

  useEffect(() => {
    if (!editing) return;
    setDigits(String(Math.abs(editing.amount)));
    setCategoryName(editing.category);
    setNote(editing.name);
  }, [editing]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    let start: number | null = null;
    let end: number | null = null;
    if (range === "this") {
      start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (range === "last") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      end = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
    } else if (range === "custom") {
      // Ignore malformed/cleared inputs instead of filtering with NaN bounds.
      const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : Number.NaN;
      const toTime = to ? new Date(`${to}T23:59:59`).getTime() : Number.NaN;
      if (!Number.isNaN(fromTime)) start = fromTime;
      if (!Number.isNaN(toTime)) end = toTime;
    }

    // A stream restricts the universe of rows before any user filter applies.
    const source = stream
      ? state.transactions.filter((t) =>
          stream === "driver" ? isDriverTx(t) : isCustomTx(state, t),
        )
      : state.transactions;

    return [...source]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter((t) => {
        if (typeFilter !== "all" && typeOf(t) !== typeFilter) return false;
        const ts = new Date(t.date).getTime();
        if (start !== null && ts < start) return false;
        if (end !== null && ts > end) return false;
        if (wallets.length && !wallets.includes(t.via)) return false;
        if (cats.length && !cats.includes(t.category)) return false;
        if (!q) return true;
        const haystack = [
          t.name,
          t.category,
          t.via,
          kindLabel(t),
          String(Math.abs(t.amount)),
          Math.abs(t.amount).toLocaleString("id-ID"),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [state, query, typeFilter, range, from, to, wallets, cats, stream]);

  const totalRecords = useMemo(
    () =>
      stream
        ? state.transactions.filter((t) =>
            stream === "driver" ? isDriverTx(t) : isCustomTx(state, t),
          ).length
        : state.transactions.length,
    [state, stream],
  );

  const allCategories = useMemo(() => {
    const names = new Set<string>(categories.map((c) => c.name));
    state.transactions.forEach((t) => names.add(t.category));
    return [...names];
  }, [categories, state.transactions]);

  const toggle = (value: string, list: string[], set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const editKind = editing && editing.amount > 0 ? "income" : "expense";
  const editCategories = categories.filter((c) => c.kind === editKind);

  function saveEdit() {
    if (!editing) return;
    const value = Number(digits || 0);
    if (value <= 0) return;
    const icon = categories.find((c) => c.name === categoryName)?.icon ?? editing.icon;
    const result = updateTransaction(editing.id, {
      amount: editing.amount < 0 ? -value : value,
      category: categoryName || editing.category,
      name: note.trim() || editing.name,
      icon,
    });
    if (!reportMutation(result, "wallet", lang)) return;
    setEditing(null);
  }

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="All transactions"
    >
      <div
        className={`bg-background/80 absolute inset-0 backdrop-blur-sm transition-opacity duration-[250ms] ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute inset-0 mx-auto flex w-full max-w-md flex-col transition-all duration-[250ms] ease-out will-change-transform ${
          visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <header className="glass-hero shrink-0 rounded-b-3xl px-5 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              aria-label="Back to home"
              className="glass tap grid size-9 shrink-0 place-items-center rounded-full"
            >
              <ArrowLeft className="size-4" strokeWidth={2} />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold tracking-tight">
                {title ??
                  (stream === "driver"
                    ? t("at.driverTitle")
                    : stream === "custom"
                      ? t("at.customTitle")
                      : t("at.title"))}
              </h2>
              <p className="text-muted-foreground text-[11px]">
                {list.length} of {totalRecords} records
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="glass tap text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="glass flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3.5 py-2.5">
              <Search className="text-muted-foreground size-4 shrink-0" strokeWidth={1.9} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("at.search")}
                aria-label="Search transactions"
                className="placeholder:text-muted-foreground/70 w-full min-w-0 bg-transparent text-sm outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="tap text-muted-foreground shrink-0"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
            <button
              onClick={() => setFilterOpen(true)}
              aria-label="Open filters"
              className={`glass tap relative grid size-11 shrink-0 place-items-center rounded-2xl ${
                activeFilters
                  ? "text-foreground shadow-primary/40 shadow-[0_0_16px]"
                  : "text-muted-foreground"
              }`}
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.9} />
              {activeFilters > 0 && (
                <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[9px] font-semibold">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>

          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
            {TYPE_PILLS.map((p) => (
              <Chip key={p.key} active={typeFilter === p.key} onClick={() => setTypeFilter(p.key)}>
                {t(p.label)}
              </Chip>
            ))}
          </div>
        </header>

        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pt-4 pb-10">
          {list.map((tx) => {
            const Icon = iconFor(tx.icon);
            const positive = tx.amount > 0;
            return (
              <li
                key={tx.id}
                className="glass animate-fade-in flex items-center gap-3 rounded-2xl px-3.5 py-3"
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full ${
                    positive ? "bg-income/15 text-income" : "bg-secondary text-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{kindLabel(tx)}</p>
                  <p
                    className="text-muted-foreground truncate text-[11px]"
                    suppressHydrationWarning
                  >
                    {relativeDate(tx.date)} · {badgeFor(tx)} · {tx.via}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      positive ? "text-income" : "text-expense"
                    }`}
                  >
                    {positive ? "+" : "−"} {money(Math.abs(tx.amount))}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditing(tx)}
                      aria-label={`Edit ${tx.name}`}
                      className="glass tap text-muted-foreground grid size-7 place-items-center rounded-full"
                    >
                      <Pencil className="size-3" strokeWidth={1.9} />
                    </button>
                    <button
                      onClick={() => setConfirming(tx)}
                      aria-label={`Delete ${tx.name}`}
                      className="glass tap text-expense grid size-7 place-items-center rounded-full"
                    >
                      <Trash2 className="size-3" strokeWidth={1.9} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="glass animate-fade-in rounded-2xl px-5 py-10 text-center">
              <span className="bg-secondary text-muted-foreground mx-auto grid size-12 place-items-center rounded-full">
                <Search className="size-5" strokeWidth={1.7} />
              </span>
              {totalRecords === 0 ? (
                <>
                  {/* Nothing has ever been recorded here — filters aren't the cause. */}
                  <p className="mt-4 text-sm font-medium">{t("at.emptyStream")}</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {t("at.emptyStreamHint")}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-sm font-medium">{t("at.none")}</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">{t("at.noneHint")}</p>
                  <button
                    onClick={resetFilters}
                    className="glass tap mx-auto mt-4 block rounded-full px-4 py-2 text-[11px] font-semibold"
                  >
                    {t("at.resetFilters")}
                  </button>
                </>
              )}
            </li>
          )}
        </ul>
      </div>

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t("at.filters")}>
        <div className="pb-2">
          <p className="text-muted-foreground mt-4 text-[11px] tracking-widest uppercase">
            {t("at.dateRange")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {RANGE_PILLS.map((r) => (
              <Chip key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
                {t(r.label)}
              </Chip>
            ))}
          </div>
          {range === "custom" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="glass rounded-2xl px-3 py-2">
                <span className="text-muted-foreground block text-[10px] uppercase">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="Start date"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </label>
              <label className="glass rounded-2xl px-3 py-2">
                <span className="text-muted-foreground block text-[10px] uppercase">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="End date"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </label>
            </div>
          )}

          <p className="text-muted-foreground mt-5 text-[11px] tracking-widest uppercase">
            {t("at.wallets")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.accounts.map((a) => (
              <Chip
                key={a.id}
                active={wallets.includes(a.name)}
                onClick={() => toggle(a.name, wallets, setWallets)}
              >
                {a.name}
              </Chip>
            ))}
          </div>

          <p className="text-muted-foreground mt-5 text-[11px] tracking-widest uppercase">
            {t("at.categories")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {allCategories.map((name) => (
              <Chip
                key={name}
                active={cats.includes(name)}
                onClick={() => toggle(name, cats, setCats)}
              >
                {name}
              </Chip>
            ))}
          </div>

          <PrimaryButton onClick={() => setFilterOpen(false)}>
            Show {list.length} results
          </PrimaryButton>
          <button
            onClick={resetFilters}
            className="tap text-muted-foreground mt-3 w-full rounded-2xl py-3 text-sm font-medium"
          >
            {t("at.resetFilters")}
          </button>
        </div>
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("at.edit")}>
        {editing && (
          <div className="pb-2">
            <AmountField
              digits={digits}
              onDigits={setDigits}
              accent={editKind === "expense" ? "var(--expense)" : "var(--income)"}
            />

            <p className="text-muted-foreground mt-5 text-[11px] tracking-widest uppercase">
              Category
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(editCategories.length ? editCategories : categories).map((c) => (
                <Chip
                  key={c.id}
                  active={categoryName === c.name}
                  onClick={() => setCategoryName(c.name)}
                >
                  {c.name}
                </Chip>
              ))}
            </div>

            <p className="text-muted-foreground mt-5 text-[11px] tracking-widest uppercase">Note</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Note"
              className="glass mt-2 w-full rounded-2xl px-3.5 py-3 text-sm outline-none"
            />

            <PrimaryButton disabled={Number(digits || 0) <= 0} onClick={saveEdit}>
              {t("at.saveChanges")}
            </PrimaryButton>
          </div>
        )}
      </Sheet>

      <Sheet open={!!confirming} onClose={() => setConfirming(null)} title={t("at.deleteTitle")}>
        {confirming && (
          <div className="pb-2">
            <p className="text-muted-foreground mt-4 text-sm">
              {kindLabel(confirming)} · {money(Math.abs(confirming.amount))} {t("at.deleteBody")}{" "}
              {confirming.via}.
            </p>
            <PrimaryButton
              onClick={() => {
                deleteTransaction(confirming.id);
                setConfirming(null);
              }}
            >
              {t("at.deletePermanently")}
            </PrimaryButton>
            <button
              onClick={() => setConfirming(null)}
              className="tap text-muted-foreground mt-3 w-full rounded-2xl py-3 text-sm font-medium"
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
