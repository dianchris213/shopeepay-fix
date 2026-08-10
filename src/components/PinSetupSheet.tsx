import { useEffect, useRef, useState } from "react";
import { Check, Delete } from "lucide-react";

import { Sheet } from "@/components/Sheet";
import { useT } from "@/lib/i18n";

export function PinSetupSheet({
  open,
  onCancel,
  onComplete,
}: {
  open: boolean;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [stage, setStage] = useState<"set" | "confirm" | "done">("set");
  const [error, setError] = useState(false);
  // Pending step timers are cancelled on unmount / sheet close so a late
  // callback can never advance the flow after the user backed out.
  const timers = useRef<number[]>([]);
  const track = (id: number) => {
    timers.current.push(id);
  };
  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (!open) return;
    clearTimers();
    setPin("");
    setConfirmPin("");
    setStage("set");
    setError(false);
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  const current = stage === "confirm" ? confirmPin : pin;

  function push(digit: string) {
    if (stage === "done") return;
    setError(false);
    if (stage === "set") {
      const next = (pin + digit).slice(0, 4);
      setPin(next);
      if (next.length === 4) track(window.setTimeout(() => setStage("confirm"), 220));
      return;
    }
    const next = (confirmPin + digit).slice(0, 4);
    setConfirmPin(next);
    if (next.length === 4) {
      track(
        window.setTimeout(() => {
          if (next === pin) {
            setStage("done");
            track(window.setTimeout(onComplete, 620));
          } else {
            setError(true);
            setConfirmPin("");
          }
        }, 200),
      );
    }
  }

  function back() {
    setError(false);
    if (stage === "confirm") setConfirmPin((v) => v.slice(0, -1));
    else setPin((v) => v.slice(0, -1));
  }

  return (
    <Sheet open={open} onClose={onCancel} title={t("pin.title")}>
      <p className="text-muted-foreground mt-4 text-center text-xs">
        {stage === "done" ? t("pin.enabled") : stage === "set" ? t("pin.choose") : t("pin.confirm")}
      </p>

      <div className="mt-5 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="size-3.5 rounded-full transition-colors duration-200"
            style={{
              backgroundColor:
                stage === "done"
                  ? "var(--income)"
                  : current.length > i
                    ? "var(--primary)"
                    : "var(--secondary)",
            }}
          />
        ))}
      </div>

      {error && (
        <p className="text-expense animate-fade-in mt-3 text-center text-[11px] font-medium">
          {t("pin.mismatch")}
        </p>
      )}

      {stage === "done" ? (
        <div className="text-income mt-6 flex items-center justify-center gap-2 pb-6 text-sm font-semibold">
          <Check className="animate-scale-in size-5" strokeWidth={2.4} /> {t("pin.secured")}
        </div>
      ) : (
        <div className="mx-auto mt-6 grid max-w-[260px] grid-cols-3 gap-2.5 pb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => push(d)}
              className="glass tap grid h-14 place-items-center rounded-2xl text-lg font-semibold tabular-nums"
            >
              {d}
            </button>
          ))}
          <span />
          <button
            onClick={() => push("0")}
            className="glass tap grid h-14 place-items-center rounded-2xl text-lg font-semibold tabular-nums"
          >
            0
          </button>
          <button
            onClick={back}
            aria-label="Delete"
            className="glass tap text-muted-foreground grid h-14 place-items-center rounded-2xl"
          >
            <Delete className="size-5" strokeWidth={1.9} />
          </button>
        </div>
      )}
    </Sheet>
  );
}
