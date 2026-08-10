import { translate, type Language, type TranslationKey } from "@/lib/i18n";
import { toast } from "@/lib/toast-store";

type Reason =
  | "duplicate"
  | "invalid-name"
  | "invalid-amount"
  | "not-found"
  | "insufficient-funds"
  | "missing-cash-wallet";
type Entity = "wallet" | "category" | "bill";

const duplicateKeys: Record<Entity, [TranslationKey, TranslationKey]> = {
  wallet: ["vd.dupWallet", "vd.dupWalletBody"],
  category: ["vd.dupCategory", "vd.dupCategoryBody"],
  bill: ["vd.dupBill", "vd.dupBillBody"],
};

/**
 * Turns a store validation failure into a user-facing banner.
 * Returns true when the mutation succeeded, so callers can read it as a guard.
 */
export function reportMutation(
  result: { ok: true } | { ok: false; reason: Reason },
  entity: Entity,
  lang: Language,
  successTitle?: TranslationKey,
): boolean {
  if (result.ok) {
    if (successTitle) toast.success(translate(lang, successTitle));
    return true;
  }

  const [dupTitle, dupBody] = duplicateKeys[entity];
  const pairs: Record<Reason, [TranslationKey, TranslationKey]> = {
    duplicate: [dupTitle, dupBody],
    "invalid-name": ["vd.nameRequired", "vd.nameRequiredBody"],
    "invalid-amount": ["vd.amountRequired", "vd.amountRequiredBody"],
    "not-found": ["err.generic", "err.genericBody"],
    "insufficient-funds": ["vd.insufficient", "vd.insufficientBody"],
    "missing-cash-wallet": ["vd.noCashWallet", "vd.noCashWalletBody"],
  };
  const [title, body] = pairs[result.reason];
  toast.error(translate(lang, title), translate(lang, body));
  return false;
}
