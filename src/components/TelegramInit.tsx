import { useEffect } from "react";

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  viewportStableHeight?: number;
  viewportHeight?: number;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
};

function getWebApp(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

/**
 * Telegram Mini App bootstrap: mark the app as ready and expand it to the full
 * height Telegram allows, then mirror the reported viewport height into
 * `--tg-viewport-height` so the app shell can size itself exactly.
 */
export function TelegramInit() {
  useEffect(() => {
    const applyHeight = () => {
      const app = getWebApp();
      const height = app?.viewportStableHeight ?? app?.viewportHeight;
      if (typeof height === "number" && height > 0) {
        document.documentElement.style.setProperty("--tg-viewport-height", `${height}px`);
        return;
      }
      // Outside Telegram (or before it reports a height) fall back to the
      // visual viewport so the shell still fits the on-screen area exactly.
      const fallback = window.visualViewport?.height ?? window.innerHeight;
      if (fallback > 0) {
        document.documentElement.style.setProperty("--tg-viewport-height", `${fallback}px`);
      }
    };

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending: ReturnType<typeof setTimeout>[] = [];
    let app: TelegramWebApp | undefined;

    /**
     * Rotation and keyboard dismissal report the *old* height for a frame or
     * two, so re-sync a few times after the event settles.
     */
    const resync = () => {
      applyHeight();
      [60, 180, 400].forEach((delay) => pending.push(setTimeout(applyHeight, delay)));
    };

    const init = () => {
      app = getWebApp();
      if (!app) {
        if (attempts++ < 20) timer = setTimeout(init, 100);
        applyHeight();
        return;
      }
      app.ready?.();
      app.expand?.();
      app.disableVerticalSwipes?.();
      applyHeight();
      app.onEvent?.("viewportChanged", resync);
    };

    init();

    window.addEventListener("orientationchange", resync);
    window.addEventListener("resize", applyHeight);
    window.visualViewport?.addEventListener("resize", applyHeight);

    return () => {
      if (timer) clearTimeout(timer);
      pending.forEach(clearTimeout);
      app?.offEvent?.("viewportChanged", resync);
      window.removeEventListener("orientationchange", resync);
      window.removeEventListener("resize", applyHeight);
      window.visualViewport?.removeEventListener("resize", applyHeight);
    };
  }, []);

  return null;
}
