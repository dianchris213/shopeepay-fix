import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { PrimaryButton, Sheet } from "@/components/Sheet";
import { updateProfile, useFinance } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

const avatars = ["C2", "CK", "🦊", "🚀", "🌙", "💎", "🐼", "⚡"];

export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useFinance();
  const { t } = useT();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(profile.name);
    setAvatar(profile.avatar);
    setDone(false);
  }, [open, profile]);

  const valid = name.trim().length > 0 && !done;

  function submit() {
    if (!valid) return;
    updateProfile({ name: name.trim(), avatar });
    setDone(true);
    window.setTimeout(onClose, 480);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("profile.title")}>
      <div className="mt-5 grid place-items-center">
        <span className="from-primary to-primary-foreground/40 text-primary-foreground grid size-20 place-items-center rounded-full bg-gradient-to-br text-2xl font-semibold">
          {avatar}
        </span>
      </div>

      <p className="mt-5 text-xs font-semibold tracking-tight">{t("profile.avatar")}</p>
      <div className="mt-2.5 grid grid-cols-8 gap-1.5">
        {avatars.map((a) => (
          <button
            key={a}
            onClick={() => setAvatar(a)}
            aria-pressed={a === avatar}
            className={`tap grid aspect-square place-items-center rounded-xl text-sm transition-colors duration-200 ${
              a === avatar ? "bg-primary/25 text-foreground" : "glass text-muted-foreground"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <label className="glass mt-4 block rounded-2xl px-3.5 py-2.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {t("profile.displayName")}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="placeholder:text-muted-foreground/60 mt-1 w-full bg-transparent text-sm outline-none"
          placeholder={t("profile.namePlaceholder")}
        />
      </label>

      <PrimaryButton disabled={!valid} onClick={submit}>
        {done ? (
          <>
            <Check className="animate-scale-in size-5" strokeWidth={2.4} /> {t("profile.saved")}
          </>
        ) : (
          t("profile.save")
        )}
      </PrimaryButton>
    </Sheet>
  );
}
