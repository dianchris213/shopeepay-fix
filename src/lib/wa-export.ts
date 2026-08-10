/**
 * WhatsApp group export.
 *
 * Pure formatting helpers — they never mutate the store, so the summary can be
 * unit-tested and reused by any share surface.
 */
import { formatAmount, totalBalance, type FinanceState } from "@/lib/finance-store";
import type { Language } from "@/lib/i18n";

/** How many recent transactions the summary lists. */
export const WA_RECENT_LIMIT = 8;

export function categoryTotals(s: FinanceState): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const tx of s.transactions) {
    map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

const labels = {
  en: {
    title: "FINANCIAL SUMMARY",
    total: "Total Balance",
    categories: "Categories",
    recent: "Recent Transactions",
    remaining: "Remaining Balance",
    none: "(none)",
  },
  id: {
    title: "RINGKASAN KEUANGAN",
    total: "Total Saldo",
    categories: "Kategori",
    recent: "Transaksi Terbaru",
    remaining: "Sisa Saldo",
    none: "(belum ada)",
  },
} satisfies Record<Language, Record<string, string>>;

/** Neat, dash-bulleted plain text sized for a WhatsApp message. */
export function buildWhatsAppSummary(s: FinanceState, now: Date = new Date()): string {
  const lang = s.settings.language;
  const currency = s.settings.currency;
  const L = labels[lang] ?? labels.en;
  const money = (v: number) => formatAmount(v, currency, lang);

  const total = totalBalance(s);
  const unpaid = s.bills.reduce((sum, b) => (b.paid ? sum : sum + b.amount), 0);
  const cats = categoryTotals(s);
  const recent = s.transactions.slice(0, WA_RECENT_LIMIT);

  const lines: string[] = [];
  lines.push(`*${L.title}*`);
  lines.push(now.toLocaleDateString(lang === "id" ? "id-ID" : "en-US"));
  lines.push("");
  lines.push(`*${L.total}:* ${money(total)}`);
  lines.push("");
  lines.push(`*${L.categories}*`);
  if (cats.length === 0) lines.push(`- ${L.none}`);
  for (const { category, amount } of cats) {
    lines.push(`- ${category}: ${amount < 0 ? "−" : "+"} ${money(Math.abs(amount))}`);
  }
  lines.push("");
  lines.push(`*${L.recent}*`);
  if (recent.length === 0) lines.push(`- ${L.none}`);
  for (const tx of recent) {
    const day = new Date(tx.date).toLocaleDateString(lang === "id" ? "id-ID" : "en-US");
    lines.push(
      `- ${day} · ${tx.name} (${tx.via}): ${tx.amount < 0 ? "−" : "+"} ${money(Math.abs(tx.amount))}`,
    );
  }
  lines.push("");
  lines.push(`*${L.remaining}:* ${money(total - unpaid)}`);

  return lines.join("\n");
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens the WhatsApp share sheet with the current summary. */
export function shareToWhatsApp(s: FinanceState) {
  const url = whatsappShareUrl(buildWhatsAppSummary(s));
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return url;
}
