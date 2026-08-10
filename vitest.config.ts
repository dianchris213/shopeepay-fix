/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

// Standalone Vitest config — deliberately separate from vite.config.ts so the
// TanStack Start / nitro plugin chain never runs inside the test environment.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Coverage is a CI gate: `bun run test:coverage` fails the build when the
    // core logic layer (src/lib) regresses below the committed thresholds.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/lovable-error-reporting.ts",
        "src/lib/error-capture.ts",
        "src/lib/error-page.ts",
        "src/lib/utils.ts",
        "src/lib/icon-map.ts",
        "src/lib/i18n.ts",
        "src/lib/account.functions.ts",
      ],
      thresholds: {
        statements: 50,
        branches: 44,
        functions: 46,
        lines: 54,
      },
    },
  },
});
