/**
 * Lightweight, device-local usage analytics.
 *
 * Deliberately tiny: no network, no identifiers, no PII — just monotonic
 * counters plus the timestamp of the last occurrence, persisted so the numbers
 * survive a reload. It answers product questions such as "how often is the
 * WhatsApp export preview opened?" without shipping anything off the device.
 */

import { useSyncExternalStore } from "react";

export const USAGE_EVENTS = ["wa_export_preview_opened", "driver_cod_undo"] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

export type UsageCounter = { count: number; lastAt: number | null };

export type UsageStats = Record<UsageEvent, UsageCounter>;

const STORAGE_KEY = "c2h.usage.v1";

function empty(): UsageStats {
  return USAGE_EVENTS.reduce((acc, event) => {
    acc[event] = { count: 0, lastAt: null };
    return acc;
  }, {} as UsageStats);
}

let stats: UsageStats = empty();
let hydrated = false;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* storage full or blocked — analytics must never break the app */
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<UsageStats>;
    const next = empty();
    for (const event of USAGE_EVENTS) {
      const entry = parsed[event];
      if (entry && typeof entry.count === "number") {
        next[event] = { count: entry.count, lastAt: entry.lastAt ?? null };
      }
    }
    stats = next;
  } catch {
    /* ignore malformed storage */
  }
}

/** Record one occurrence of a usage event. Returns the updated counter. */
export function trackUsage(event: UsageEvent, at: number = Date.now()): UsageCounter {
  ensureHydrated();
  const previous = stats[event];
  const next: UsageCounter = { count: previous.count + 1, lastAt: at };
  stats = { ...stats, [event]: next };
  persist();
  listeners.forEach((l) => l());
  return next;
}

export function getUsageStats(): UsageStats {
  ensureHydrated();
  return stats;
}

export function usageCount(event: UsageEvent): number {
  return getUsageStats()[event].count;
}

/** Test/debug helper: wipe every counter. */
export function resetUsageStats() {
  stats = empty();
  hydrated = true;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  ensureHydrated();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUsageStats(): UsageStats {
  return useSyncExternalStore(subscribe, getUsageStats, () => stats);
}
