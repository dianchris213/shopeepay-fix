import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, Mail, Wallet } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { hydrateFromCloud, stopCloudSync } from "@/lib/supabase-sync";
import {
  ensureDefaultCustomAccount,
  ensureShopeePayAccount,
  updateProfile,
  useFinance,
} from "@/lib/finance-store";
import { useT } from "@/lib/i18n";
import { describeAuthError, describeDataError } from "@/lib/error-messages";
import { clearToasts, toast } from "@/lib/toast-store";
import { verifySession, watchSessionLifecycle } from "@/lib/session-resilience";
import { startProactiveRefresh } from "@/lib/session-refresh";

import { DashboardSkeleton } from "@/components/LoadingSkeletons";

type Mode = "signin" | "signup" | "forgot";

function AuthScreen() {
  const { t, lang } = useT();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setMessage(`${t("toast.resetSent")} — ${t("toast.resetSentBody")}`);
        toast.success(t("toast.resetSent"), t("toast.resetSentBody"));
        // Success only: clear the email so the field isn't left populated.
        setEmail("");
      } else if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name: name.trim() || email.split("@")[0] },
          },
        });
        if (err) throw err;
        // Success only (session or confirm-email path): clear credentials.
        setEmail("");
        setPassword("");
        setName("");
        if (!data.session) {
          setMessage(`${t("toast.confirmEmail")} — ${t("toast.confirmEmailBody")}`);
          toast.info(t("toast.confirmEmail"), t("toast.confirmEmailBody"));
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        toast.success(t("toast.signedIn"));
      }
    } catch (err) {
      // Never surface raw Supabase JSON — always a human-readable banner.
      const friendly = describeAuthError(err, lang);
      setError(`${friendly.title} — ${friendly.body}`);
      toast.error(friendly.title, friendly.body);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (err) {
      const friendly = describeAuthError(err, lang);
      setError(`${friendly.title} — ${friendly.body}`);
      toast.error(friendly.title, friendly.body);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="animate-fade-in">
        <span className="from-primary to-primary-foreground/40 text-primary-foreground grid size-14 place-items-center rounded-2xl bg-gradient-to-br">
          <Wallet className="size-7" strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">C2H KEUANGAN</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {mode === "signin"
            ? t("auth.signinSub")
            : mode === "signup"
              ? t("auth.signupSub")
              : t("auth.forgotSub")}
        </p>
      </div>

      <form onSubmit={submit} className="glass mt-7 rounded-3xl p-5">
        {mode === "signup" && (
          <label className="glass mb-2.5 block rounded-2xl px-3.5 py-2.5">
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Display name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
            />
          </label>
        )}

        <label className="glass block rounded-2xl px-3.5 py-2.5">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-wide uppercase">
            <Mail className="size-3" strokeWidth={2} /> Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
          />
        </label>

        {mode !== "forgot" && (
          <label className="glass mt-2.5 block rounded-2xl px-3.5 py-2.5">
            <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-wide uppercase">
              <Lock className="size-3" strokeWidth={2} /> Password
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
        )}

        {error && (
          <p role="alert" className="mt-3 text-[11px]" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        )}
        {message && <p className="text-muted-foreground mt-3 text-[11px]">{message}</p>}

        <button
          type="submit"
          disabled={busy}
          className="tap from-primary to-primary-foreground/40 text-primary-foreground shadow-primary/25 mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r py-3.5 text-sm font-semibold shadow-lg transition-opacity duration-200 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />}
          {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
        </button>

        {mode !== "forgot" && (
          <button
            type="button"
            onClick={google}
            className="glass tap mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-medium transition-colors duration-200"
          >
            Continue with Google
          </button>
        )}

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError(null);
              setMessage(null);
            }}
            className="text-muted-foreground tap mt-3 w-full text-center text-xs"
          >
            Forgot your password?
          </button>
        )}
      </form>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setMessage(null);
          // Switching modes starts a fresh form.
          setEmail("");
          setPassword("");
          setName("");
        }}
        className="text-muted-foreground tap mt-5 text-center text-xs"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

function Splash({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="text-primary size-6 animate-spin" strokeWidth={2.2} />
        <p className="text-muted-foreground text-xs tracking-widest uppercase">{label}</p>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t, lang } = useT();
  const { profile } = useFinance();
  const langRef = useRef(lang);
  langRef.current = lang;
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
        if (!active) return;
        setSession(next);
        setChecked(true);
        if (!next) {
          stopCloudSync();
          clearToasts();
          setReady(false);
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      void supabase.auth
        .getSession()
        .then(({ data, error: sessionError }) => {
          if (sessionError) throw sessionError;
          if (!active) return;
          setSession(data.session);
          setChecked(true);
        })
        .catch((authError: unknown) => {
          if (!active) return;
          console.error("[auth bootstrap]", authError);
          const friendly = describeAuthError(authError, langRef.current);
          toast.error(friendly.title, friendly.body);
          setSession(null);
          setChecked(true);
        });
    } catch (authError) {
      console.error("[auth initialization]", authError);
      const friendly = describeAuthError(authError, langRef.current);
      toast.error(friendly.title, friendly.body);
      setSession(null);
      setChecked(true);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let active = true;
    void hydrateFromCloud(uid)
      .catch((e: unknown) => {
        console.error("[cloud hydrate]", e);
        const friendly = describeDataError(e, langRef.current);
        toast.error(friendly.title, friendly.body);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  // Keep the display name aligned with the signed-in Supabase identity when
  // the cloud profile has no meaningful name yet.
  useEffect(() => {
    if (!ready || !session?.user) return;
    const meta = session.user.user_metadata as { name?: string; full_name?: string } | null;
    const fallback =
      meta?.name?.trim() || meta?.full_name?.trim() || session.user.email?.split("@")[0] || "";
    if (!fallback) return;
    if (!profile.name.trim() || profile.name === "User") {
      updateProfile({ name: fallback, avatar: fallback.slice(0, 1).toUpperCase() });
    }
  }, [ready, session, profile.name]);

  // Every user always has one editable custom wallet ("Dana Custom" by default),
  // created once after the cloud data lands so it syncs like any other wallet.
  useEffect(() => {
    if (!ready) return;
    ensureDefaultCustomAccount();
    ensureShopeePayAccount();
  }, [ready]);

  // Telegram Mini Apps get suspended in the background; when the user returns
  // the cached access token is often stale. Re-verify (and refresh) on every
  // foreground transition so the first tap after resuming never 401s.
  useEffect(() => {
    if (!session) return;
    return watchSessionLifecycle(() => {
      void verifySession().then((ok) => {
        if (!ok) {
          stopCloudSync();
          setReady(false);
        }
      });
    });
  }, [session?.user.id]);

  // Additive second layer: a timer that stays one step ahead of expiry, so a
  // long-lived tab refreshes silently instead of discovering a dead token on
  // the next query. Revoked sessions tear the sync down immediately.
  useEffect(() => {
    if (!session) return;
    return startProactiveRefresh(() => {
      stopCloudSync();
      setReady(false);
    });
  }, [session?.user.id]);

  if (!checked) return <Splash label={`${t("auth.starting")} C2H KEUANGAN`} />;
  if (!session) return <AuthScreen />;
  if (!ready) return <DashboardSkeleton label={t("auth.syncing")} />;
  return <>{children}</>;
}
