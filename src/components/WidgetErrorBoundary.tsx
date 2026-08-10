import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { reportLovableError } from "@/lib/lovable-error-reporting";
import { captureTelemetry, addBreadcrumb } from "@/lib/telemetry";

import { translate, useT } from "@/lib/i18n";

type Props = {
  /** Short identifier used in logs, e.g. "home-recent-transactions". */
  name: string;
  /** Optional label rendered above the generic message. */
  label?: string;
  children: ReactNode;
};

type State = { error: Error | null };

function Fallback({
  label,
  name,
  onRetry,
}: {
  label?: string | undefined;
  name: string;
  onRetry: () => void;
}) {
  // useT lives inside the finance store; if that itself is the failing part the
  // boundary still renders because translate() falls back to English keys.
  const { t } = useT();
  return (
    <div
      role="alert"
      data-testid={`widget-error-${name}`}
      className="glass text-muted-foreground flex flex-col items-center gap-2 rounded-2xl px-3 py-5 text-center"
    >
      <span className="bg-expense/15 text-expense grid size-8 place-items-center rounded-full">
        <AlertTriangle className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <p className="text-foreground text-xs font-semibold">{label ?? t("err.widgetTitle")}</p>
      <p className="max-w-[16rem] text-[11px] leading-snug">{t("err.widgetBody")}</p>
      <button
        onClick={onRetry}
        className="tap glass text-foreground mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
      >
        <RotateCcw className="size-3" strokeWidth={2} aria-hidden />
        {t("err.retry")}
      </button>
    </div>
  );
}

/**
 * Localised error boundary. A crash inside one widget (dashboard hero,
 * analytics chart, recent transactions…) renders a small fallback card instead
 * of taking the whole Mini App down to a white screen.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };
  private retries = 0;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[widget:${this.props.name}]`, error, info.componentStack);
    // Full stack + component tree + widget state, PII-scrubbed by the telemetry
    // layer before it reaches any sink.
    captureTelemetry(`widget.${this.props.name}`, error, {
      widget: this.props.name,
      hasLabel: Boolean(this.props.label),
      retries: this.retries,
      componentStack: info.componentStack ?? undefined,
      route: typeof window === "undefined" ? undefined : window.location.pathname,
      online: typeof navigator === "undefined" ? undefined : navigator.onLine,
      viewport:
        typeof window === "undefined" ? undefined : `${window.innerWidth}x${window.innerHeight}`,
    });
    reportLovableError(error, { boundary: `widget_${this.props.name}` });
  }

  private reset = () => {
    this.retries += 1;
    addBreadcrumb("ui", `widget-retry:${this.props.name}`, { retries: this.retries });
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      try {
        return <Fallback label={this.props.label} name={this.props.name} onRetry={this.reset} />;
      } catch {
        // Last-resort static fallback if even the store hook throws.
        return (
          <div role="alert" className="text-muted-foreground px-3 py-5 text-center text-xs">
            {translate("en", "err.widgetTitle")}
          </div>
        );
      }
    }
    return this.props.children;
  }
}
