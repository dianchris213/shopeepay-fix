import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { describeAuthError } from "@/lib/error-messages";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — C2H KEUANGAN" },
      {
        name: "description",
        content: "Set a new password for your C2H KEUANGAN finance account.",
      },
      { property: "og:title", content: "Reset Password — C2H KEUANGAN" },
      {
        property: "og:description",
        content: "Set a new password for your C2H KEUANGAN finance account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const { t, lang } = useT();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password !== confirm) {
      setError(t("rp.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      window.setTimeout(() => void navigate({ to: "/" }), 1200);
    } catch (err) {
      // Localized, human-readable copy instead of raw Supabase error text.
      const friendly = describeAuthError(err, lang);
      setError(`${friendly.title} — ${friendly.body}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">New password</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Choose a new password for your C2H KEUANGAN account.
      </p>

      <form onSubmit={submit} className="glass mt-7 rounded-3xl p-5">
        <label className="glass block rounded-2xl px-3.5 py-2.5">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-wide uppercase">
            <Lock className="size-3" strokeWidth={2} /> New password
          </span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
          />
        </label>

        <label className="glass mt-2.5 block rounded-2xl px-3.5 py-2.5">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-wide uppercase">
            <Lock className="size-3" strokeWidth={2} /> Confirm password
          </span>
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-[11px]" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        )}
        {done && (
          <p className="text-muted-foreground mt-3 text-[11px]">
            Password updated. Taking you to the app…
          </p>
        )}

        <button
          type="submit"
          disabled={busy || done}
          className="tap from-primary to-primary-foreground/40 text-primary-foreground shadow-primary/25 mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r py-3.5 text-sm font-semibold shadow-lg transition-opacity duration-200 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />}
          Update password
        </button>
      </form>
    </div>
  );
}
