import { reportLovableError } from "@/lib/lovable-error-reporting";
import {
  addBreadcrumb,
  captureTelemetry,
  registerTelemetrySink,
  setTelemetryRelease,
  type TelemetryEvent,
} from "@/lib/telemetry";

/**
 * Browser-side wiring for the telemetry funnel.
 *
 * Installed once from the root route. Everything here is additive: it only
 * observes, it never changes app behaviour.
 */

let installed = false;

/** Forward redacted events to the Lovable/editor reporting hook. */
function lovableSink(event: TelemetryEvent) {
  const error = Object.assign(new Error(event.message), {
    name: event.kind ?? "Error",
    stack: event.stack ?? undefined,
  });
  reportLovableError(error, {
    scope: event.scope,
    severity: event.severity,
    release: event.release,
    ...event.context,
    breadcrumbs: event.breadcrumbs.slice(-8),
  });
}

/**
 * Install global handlers + default sinks. Idempotent and safe to call during
 * SSR (it no-ops without a `window`). Returns a teardown for tests.
 */
export function installTelemetry(): () => void {
  if (typeof window === "undefined" || installed) return () => {};
  installed = true;

  setTelemetryRelease(import.meta.env.MODE ?? "production");
  const unregister = registerTelemetrySink(lovableSink);

  const onError = (event: ErrorEvent) =>
    void captureTelemetry("window.onerror", event.error ?? event.message, {
      route: window.location.pathname,
    });

  const onRejection = (event: PromiseRejectionEvent) =>
    void captureTelemetry("window.unhandledrejection", event.reason, {
      route: window.location.pathname,
    });

  const onOffline = () => addBreadcrumb("network", "offline");
  const onOnline = () => addBreadcrumb("network", "online");
  const onVisibility = () => addBreadcrumb("lifecycle", `visibility:${document.visibilityState}`);

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    installed = false;
    unregister();
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
