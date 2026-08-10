import { useEffect } from "react";

import { useFinance } from "@/lib/finance-store";

/**
 * Applies the user's theme and motion preferences to <html>.
 * Dark is the default palette (:root); the `light` class swaps every token.
 * The `reduce-motion` class disables animations and transitions app-wide.
 */
export function ThemeApplier() {
  const { settings } = useFinance();
  const reduceMotion = settings.reduceMotion;

  // Motion preference is applied first so the theme swap below can read it.
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    const root = document.documentElement;
    const isLight = settings.theme === "light";
    if (root.classList.contains("light") === isLight) {
      root.style.colorScheme = isLight ? "light" : "dark";
      return;
    }

    // With Reduce Motion on, swap the palette instantly — no crossfade.
    if (reduceMotion) {
      root.classList.toggle("light", isLight);
      root.style.colorScheme = isLight ? "light" : "dark";
      return;
    }

    // Enable the palette crossfade only while switching, so scrolling and
    // chart re-renders never pay for a global transition.
    root.classList.add("theme-switching");
    root.classList.toggle("light", isLight);
    root.style.colorScheme = isLight ? "light" : "dark";
    const timer = window.setTimeout(() => root.classList.remove("theme-switching"), 320);
    return () => window.clearTimeout(timer);
  }, [settings.theme, reduceMotion]);

  return null;
}
