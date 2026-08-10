/**
 * Tiny localStorage-backed UI preference bag.
 *
 * Used to persist ephemeral view state (selected analytics range, drill-down
 * stream, transaction-sheet filters) so closing and reopening a sheet never
 * loses what the user picked. It stores presentation state only — never
 * financial data — and degrades to no-ops during SSR or when storage fails.
 */
const PREFIX = "c2h.ui.";

export function loadUiState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function saveUiState<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}
