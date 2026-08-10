import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Chip, Sheet } from "@/components/Sheet";
import { useFinance } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";
import { reportMutation } from "@/lib/mutation-feedback";
import { toast } from "@/lib/toast-store";

import {
  addCategory,
  categoryNameTaken,
  deleteCategory,
  iconKeys,
  iconMap,
  updateCategory,
  useCategories,
  type Category,
  type CategoryKind,
  type IconKey,
} from "@/lib/categories-store";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Optional initial scope: a custom wallet id. Defaults to the system list. */
  walletId?: string | null;
  /** Preselect the expense/income tab when opened from another sheet. */
  initialKind?: CategoryKind;
  /** Open straight into the "new category" draft row (quick create). */
  startCreating?: boolean;
};

function IconPicker({ value, onChange }: { value: IconKey; onChange: (icon: IconKey) => void }) {
  return (
    <div className="mt-2 grid grid-cols-7 gap-1.5" role="group" aria-label="Category icon">
      {iconKeys.map((key) => {
        const Icon = iconMap[key];
        const isActive = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-label={key}
            aria-pressed={isActive}
            className={`tap grid aspect-square place-items-center rounded-xl ${
              isActive ? "bg-primary/25 text-foreground" : "glass text-muted-foreground"
            }`}
          >
            <Icon className="size-4" strokeWidth={1.9} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Category CRUD with two isolated scopes:
 *   - the system list, shared by every standard wallet, and
 *   - one independent list per "Custom" wallet.
 * A category created in a wallet scope can never appear in another wallet.
 */
export function CategoryManagerSheet({ open, onClose, walletId = null }: Props) {
  const { t, lang } = useT();
  const all = useCategories();
  const { accounts } = useFinance();
  const customWallets = useMemo(() => accounts.filter((a) => a.type === "Custom"), [accounts]);
  const [scope, setScope] = useState<string | null>(walletId);
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState<IconKey>("food");
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setScope(walletId);
  }, [open, walletId]);

  // A deleted wallet must not leave the sheet stuck on a phantom scope.
  useEffect(() => {
    if (scope && !customWallets.some((w) => w.id === scope)) setScope(null);
  }, [scope, customWallets]);

  const list = useMemo(
    () => all.filter((c) => c.kind === kind && (c.walletId ?? null) === scope),
    [all, kind, scope],
  );
  const pending = all.find((c) => c.id === confirmId) ?? null;
  const draftTrimmed = draftName.trim();
  const draftDuplicate =
    (creating || !!editingId) &&
    draftTrimmed.length > 0 &&
    categoryNameTaken(draftTrimmed, kind, editingId ?? undefined, scope ?? undefined);

  function resetDrafts() {
    setEditingId(null);
    setCreating(false);
    setDraftName("");
  }

  function startEdit(category: Category) {
    setCreating(false);
    setEditingId(category.id);
    setDraftName(category.name);
    setDraftIcon(category.icon);
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setDraftName("");
    setDraftIcon(kind === "expense" ? "food" : "salary");
  }

  function saveDraft() {
    const name = draftName.trim();
    if (!name) return;
    // Snapshot the selected scope at submit time. Passing it explicitly keeps
    // a custom-wallet category out of the global System list.
    const result = creating
      ? addCategory({ name, icon: draftIcon, kind, ...(scope ? { walletId: scope } : {}) })
      : editingId
        ? updateCategory(editingId, { name, icon: draftIcon })
        : ({ ok: true } as const);
    if (
      !reportMutation(
        result,
        "category",
        lang,
        creating ? "toast.categoryAdded" : "toast.categoryUpdated",
      )
    )
      return;
    resetDrafts();
  }

  function handleClose() {
    resetDrafts();
    setConfirmId(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={handleClose} title="Manage Categories">
      {customWallets.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold tracking-tight">{t("cm.scope")}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("cm.scope")}>
            <Chip
              active={scope === null}
              onClick={() => {
                setScope(null);
                resetDrafts();
              }}
            >
              {t("cm.systemScope")}
            </Chip>
            {customWallets.map((w) => (
              <Chip
                key={w.id}
                active={scope === w.id}
                onClick={() => {
                  setScope(w.id);
                  resetDrafts();
                }}
              >
                {w.name}
              </Chip>
            ))}
          </div>
          {scope !== null && (
            <p className="text-muted-foreground mt-2 text-[11px]">{t("cm.walletScopeHint")}</p>
          )}
        </div>
      )}

      <div className="glass mt-4 grid shrink-0 grid-cols-2 gap-1 rounded-full p-1">
        {(["expense", "income"] as const).map((option) => {
          const isActive = kind === option;
          const color = option === "expense" ? "var(--expense)" : "var(--income)";
          return (
            <button
              key={option}
              onClick={() => {
                setKind(option);
                resetDrafts();
              }}
              aria-pressed={isActive}
              className="tap rounded-full py-2 text-xs font-semibold"
              style={
                isActive
                  ? {
                      backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`,
                      color,
                      boxShadow: `0 0 18px -4px color-mix(in oklab, ${color} 70%, transparent)`,
                    }
                  : { color: "var(--muted-foreground)" }
              }
            >
              {option === "expense" ? t("cm.expenseCats") : t("cm.incomeCats")}
            </button>
          );
        })}
      </div>

      <div className="-mx-1 mt-4 space-y-2 px-1 pb-1" aria-live="polite">
        {list.length === 0 && !creating && (
          <p className="text-muted-foreground py-8 text-center text-xs">{t("cm.empty")}</p>
        )}

        {list.map((category) => {
          const Icon = iconMap[category.icon];
          const isEditing = editingId === category.id;
          return (
            <div key={category.id} className="glass animate-fade-in rounded-2xl p-3">
              <div className="flex items-center gap-3">
                <span className="bg-primary/15 text-primary grid size-10 shrink-0 place-items-center rounded-full">
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                {isEditing ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value.slice(0, 40))}
                    onKeyDown={(e) => e.key === "Enter" && saveDraft()}
                    aria-label="Category name"
                    className="glass min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                ) : (
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</p>
                )}
                <div className="flex shrink-0 items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={saveDraft}
                        aria-label="Save category"
                        disabled={!draftName.trim() || draftDuplicate}
                        className="glass tap text-primary grid size-8 place-items-center rounded-full disabled:opacity-40"
                      >
                        <Check className="size-4" strokeWidth={2.1} />
                      </button>
                      <button
                        onClick={resetDrafts}
                        aria-label="Cancel edit"
                        className="glass tap text-muted-foreground grid size-8 place-items-center rounded-full"
                      >
                        <X className="size-4" strokeWidth={2.1} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(category)}
                        aria-label={`Edit ${category.name}`}
                        className="glass tap text-muted-foreground grid size-8 place-items-center rounded-full"
                      >
                        <Pencil className="size-[15px]" strokeWidth={1.9} />
                      </button>
                      <button
                        onClick={() => setConfirmId(category.id)}
                        aria-label={`Delete ${category.name}`}
                        className="glass tap grid size-8 place-items-center rounded-full"
                        style={{ color: "var(--destructive)" }}
                      >
                        <Trash2 className="size-[15px]" strokeWidth={1.9} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isEditing && draftDuplicate && (
                <p role="alert" className="text-expense mt-2 text-[11px] font-medium">
                  {t("vd.dupCategoryBody")}
                </p>
              )}
              {isEditing && <IconPicker value={draftIcon} onChange={setDraftIcon} />}
            </div>
          );
        })}

        {creating && (
          <div className="glass animate-fade-in rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <span className="bg-primary/15 text-primary grid size-10 shrink-0 place-items-center rounded-full">
                {(() => {
                  const Icon = iconMap[draftIcon];
                  return <Icon className="size-[18px]" strokeWidth={1.8} />;
                })()}
              </span>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value.slice(0, 40))}
                onKeyDown={(e) => e.key === "Enter" && saveDraft()}
                placeholder={t("cm.namePlaceholder")}
                aria-label="New category name"
                className="glass placeholder:text-muted-foreground/60 min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              />
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={saveDraft}
                  aria-label="Save new category"
                  disabled={!draftName.trim() || draftDuplicate}
                  className="glass tap text-primary grid size-8 place-items-center rounded-full disabled:opacity-40"
                >
                  <Check className="size-4" strokeWidth={2.1} />
                </button>
                <button
                  onClick={resetDrafts}
                  aria-label="Cancel new category"
                  className="glass tap text-muted-foreground grid size-8 place-items-center rounded-full"
                >
                  <X className="size-4" strokeWidth={2.1} />
                </button>
              </div>
            </div>
            {draftDuplicate && (
              <p role="alert" className="text-expense mt-2 text-[11px] font-medium">
                {t("vd.dupCategoryBody")}
              </p>
            )}
            <IconPicker value={draftIcon} onChange={setDraftIcon} />
          </div>
        )}
      </div>

      <button
        onClick={startCreate}
        disabled={creating}
        className="tap from-primary to-primary-foreground/40 text-primary-foreground shadow-primary/25 mt-4 mb-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r py-3.5 text-sm font-semibold shadow-lg disabled:opacity-40"
      >
        <Plus className="size-4" strokeWidth={2.4} />
        {t("cm.addNew")}
      </button>

      <ConfirmDeleteDialog
        open={!!pending}
        title={t("cm.deleteTitle")}
        detail={pending?.name}
        description={`${t("cm.deleteBody")} “${pending?.name ?? ""}”?`}
        confirmLabel={t("cm.delete")}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (!pending) return;
          deleteCategory(pending.id);
          toast.success(t("toast.categoryDeleted"));
          setConfirmId(null);
          resetDrafts();
        }}
      />
    </Sheet>
  );
}
