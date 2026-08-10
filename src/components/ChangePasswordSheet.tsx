import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { PrimaryButton, Sheet } from "@/components/Sheet";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import {
  MIN_PASSWORD_LENGTH,
  passwordErrorKey,
  validatePasswordChange,
} from "@/lib/password-change";
import { toast } from "@/lib/toast-store";

type Props = { open: boolean; onClose: () => void };

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  testId: string;
}) {
  const { t } = useT();
  const [shown, setShown] = useState(false);

  return (
    <label className="glass mt-3 flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
          {label}
        </span>
        <input
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-label={label}
          data-testid={testId}
          className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
        />
      </span>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t("cp.hide") : t("cp.show")}
        aria-pressed={shown}
        className="tap text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center rounded-full"
      >
        {shown ? (
          <EyeOff className="size-4" strokeWidth={1.8} />
        ) : (
          <Eye className="size-4" strokeWidth={1.8} />
        )}
      </button>
    </label>
  );
}

/**
 * In-app password change. Supabase `updateUser` does not verify the old
 * password, so the current one is re-checked with a silent sign-in first —
 * otherwise an unlocked device could silently take over the account.
 */
export function ChangePasswordSheet({ open, onClose }: Props) {
  const { t } = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setBusy(false);
  }, [open]);

  async function submit() {
    if (busy) return;
    const invalid = validatePasswordChange({ current, next, confirm });
    if (invalid) {
      setError(t(invalid));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) {
        setError(t("cp.error"));
        return;
      }

      const reauth = await supabase.auth.signInWithPassword({ email, password: current });
      if (reauth.error) {
        setError(t(passwordErrorKey(reauth.error.message)));
        return;
      }

      const updated = await supabase.auth.updateUser({ password: next });
      if (updated.error) {
        setError(t(passwordErrorKey(updated.error.message)));
        return;
      }

      toast.success(t("cp.success"));
      onClose();
    } catch {
      setError(t("cp.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("cp.title")}>
      <div className="pb-4">
        <p className="text-muted-foreground mt-4 text-xs">{t("cp.hint")}</p>

        <PasswordField
          label={t("cp.current")}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          testId="cp-current"
        />
        <PasswordField
          label={t("cp.new")}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          testId="cp-new"
        />
        <PasswordField
          label={t("cp.confirm")}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          testId="cp-confirm"
        />

        {error && (
          <p
            role="alert"
            data-testid="cp-error"
            className="text-expense mt-3 text-[11px] font-medium"
          >
            {error}
          </p>
        )}

        <PrimaryButton
          disabled={busy || next.length < MIN_PASSWORD_LENGTH}
          onClick={() => {
            void submit();
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
          {t("cp.save")}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
