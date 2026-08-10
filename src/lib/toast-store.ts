import { useSyncExternalStore } from "react";

export type ToastTone = "error" | "warning" | "success" | "info";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  /** ms before auto-dismiss; 0 keeps it until dismissed manually. */
  duration: number;
  /** Optional inline action (e.g. "Undo") rendered inside the banner. */
  action?: { label: string; onClick: () => void };
};

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, number>();

const EMPTY: Toast[] = [];
const MAX_VISIBLE = 3;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `t${Date.now()}${Math.random().toString(36).slice(2)}`;

export function dismissToast(id: string) {
  const timer = timers.get(id);
  if (timer) {
    window.clearTimeout(timer);
    timers.delete(id);
  }
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function clearToasts() {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers.clear();
  if (!toasts.length) return;
  toasts = [];
  emit();
}

const defaultDuration: Record<ToastTone, number> = {
  error: 7000,
  warning: 6000,
  success: 3500,
  info: 4500,
};

export function pushToast(input: {
  tone?: ToastTone;
  title: string;
  body?: string | undefined;
  duration?: number;
  action?: { label: string; onClick: () => void };
}): string {
  const tone = input.tone ?? "info";
  const toast: Toast = {
    id: uid(),
    tone,
    title: input.title,
    ...(input.body ? { body: input.body } : {}),
    ...(input.action ? { action: input.action } : {}),
    duration: input.duration ?? defaultDuration[tone],
  };

  // Collapse an identical message that is already on screen instead of stacking it.
  const duplicate = toasts.find((t) => t.title === toast.title && t.body === toast.body);
  if (duplicate) {
    dismissToast(duplicate.id);
  }

  toasts = [...toasts, toast].slice(-MAX_VISIBLE);
  emit();

  if (toast.duration > 0 && typeof window !== "undefined") {
    timers.set(
      toast.id,
      window.setTimeout(() => dismissToast(toast.id), toast.duration),
    );
  }
  return toast.id;
}

export const toast = {
  error: (title: string, body?: string) => pushToast({ tone: "error", title, body }),
  warning: (title: string, body?: string) => pushToast({ tone: "warning", title, body }),
  success: (title: string, body?: string) => pushToast({ tone: "success", title, body }),
  info: (title: string, body?: string) => pushToast({ tone: "info", title, body }),
};

export function getToasts() {
  return toasts;
}

export function useToasts() {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
}
