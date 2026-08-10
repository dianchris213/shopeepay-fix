import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "bottom" | "right";
  children: ReactNode;
};

const DURATION = 240;

/**
 * Stack of currently open sheets (innermost last).
 *
 * Sheets nest (Manage Wallets → Edit Wallet), and a window-level key handler
 * would otherwise fire once per mounted sheet. Only the topmost entry reacts
 * to Escape/Tab, so the keyboard always belongs to the panel the user sees.
 */
const sheetStack: string[] = [];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusableWithin(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

export function Sheet({ open, onClose, title, side = "bottom", children }: Props) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const sheetId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Callers pass inline arrows; a ref keeps the focus effect from re-running
  // (and stealing focus) on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
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
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /**
   * Modal keyboard contract: focus enters the panel on open, Tab is trapped
   * inside it, Escape dismisses, and focus returns to whatever opened the
   * sheet. A nested `role="alertdialog"` (ConfirmDeleteDialog) owns the
   * keyboard while it is open and runs its own trap.
   */
  useEffect(() => {
    if (!open) return;
    sheetStack.push(sheetId);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (sheetStack[sheetStack.length - 1] !== sheetId) return;
      if (document.querySelector('[role="alertdialog"]')) return;
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableWithin(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const outside = !panel.contains(active);

      if (event.shiftKey && (active === first || active === panel || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      const index = sheetStack.lastIndexOf(sheetId);
      if (index >= 0) sheetStack.splice(index, 1);
      previouslyFocused?.focus?.();
    };
  }, [open, sheetId]);

  if (!mounted) return null;

  const panel =
    side === "bottom"
      ? `absolute inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full max-w-md rounded-t-[2rem] ${
          visible ? "translate-y-0" : "translate-y-full"
        }`
      : `absolute inset-y-0 right-0 ml-auto w-full max-w-sm rounded-l-[2rem] ${
          visible ? "translate-x-0" : "translate-x-full"
        }`;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop is intentionally inert: modals close only via the X button or a save. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-[240ms] ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="sheet-panel"
        className={`glass absolute flex flex-col overflow-hidden px-5 pt-3 pb-6 outline-none transition-transform duration-[240ms] ease-out will-change-transform ${panel}`}
      >
        {side === "bottom" && (
          <div className="bg-foreground/25 mx-auto h-1 w-10 shrink-0 rounded-full" />
        )}

        <div className="mt-3 flex shrink-0 items-center justify-between gap-3">
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="glass tap text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5">{children}</div>
      </div>
    </div>
  );
}

export function AmountField({
  digits,
  onDigits,
  accent = "var(--foreground)",
  label = "Amount",
}: {
  digits: string;
  onDigits: (next: string) => void;
  accent?: string;
  label?: string;
}) {
  const amount = Number(digits || 0);
  return (
    <div className="mt-5 text-center">
      <p className="text-muted-foreground text-[11px] tracking-widest uppercase">{label}</p>
      <label className="mt-2 flex items-baseline justify-center gap-2 py-1">
        <span className="text-muted-foreground text-xl font-medium">Rp</span>
        <input
          inputMode="numeric"
          value={digits === "" ? "0" : Number(digits).toLocaleString("id-ID")}
          onChange={(e) => onDigits(e.target.value.replace(/\D/g, "").slice(0, 12))}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={label}
          className="w-full max-w-[70%] bg-transparent text-center text-[2.2rem] leading-none font-semibold tracking-tight tabular-nums outline-none"
          style={{ color: amount > 0 ? accent : "var(--foreground)" }}
        />
      </label>
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="tap from-primary to-primary-foreground/40 text-primary-foreground shadow-primary/25 mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r py-3.5 text-sm font-semibold shadow-lg transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`tap rounded-full px-3.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors duration-200 ${
        active
          ? "bg-primary/20 text-foreground shadow-primary/40 shadow-[0_0_16px]"
          : "glass text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
