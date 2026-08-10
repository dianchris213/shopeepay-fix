// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryVitePlugin } from "@sentry/vite-plugin";

/**
 * Sentry release + source-map upload.
 *
 * Stack traces that reach Sentry are minified by definition, so without an
 * uploaded source map every frame reads `index-CYpPmyka.js:1:48213` — useless
 * for debugging. The plugin below uploads the build's source maps and creates
 * a Sentry Release so every frame is symbolicated back to the exact
 * un-minified file/line in `src/`.
 *
 * It only activates when the upload credentials are present (production CI):
 *   SENTRY_AUTH_TOKEN  — org auth token with `project:releases` scope
 *   SENTRY_ORG         — organisation slug
 *   SENTRY_PROJECT     — project slug
 * Local and preview builds are untouched, so nothing slows down or fails when
 * the secrets are not configured.
 */
const sentryUploadEnabled =
  Boolean(process.env["SENTRY_AUTH_TOKEN"]) &&
  Boolean(process.env["SENTRY_ORG"]) &&
  Boolean(process.env["SENTRY_PROJECT"]);

// Same value the runtime telemetry layer stamps on every event, so the release
// created here is the release the events are grouped under.
const release =
  process.env["VITE_APP_RELEASE"] ?? process.env["GITHUB_SHA"] ?? process.env["SENTRY_RELEASE"];

export default defineConfig({
  plugins: sentryUploadEnabled
    ? [
        sentryVitePlugin({
          org: process.env["SENTRY_ORG"]!,
          project: process.env["SENTRY_PROJECT"]!,
          authToken: process.env["SENTRY_AUTH_TOKEN"]!,
          telemetry: false,
          release: {
            ...(release ? { name: release } : {}),
            // Ties the release to the commit range so Sentry can attribute
            // regressions to the PR that introduced them.
            ...(process.env["GITHUB_SHA"]
              ? { setCommits: { auto: true as const, ignoreMissing: true, ignoreEmpty: true } }
              : {}),
          },
          sourcemaps: {
            assets: ["./dist/**/*.js", "./dist/**/*.mjs", "./dist/**/*.map"],
            // Maps are uploaded to Sentry, then deleted from the deployed
            // output: symbolication happens server-side, users never get them.
            filesToDeleteAfterUpload: ["./dist/**/*.map"],
          },
        }),
      ]
    : [],
  vite: {
    build: {
      // Required for symbolication: the plugin can only upload maps that exist.
      // "hidden" emits them without a //# sourceMappingURL comment, so the
      // browser never requests them from production.
      sourcemap: sentryUploadEnabled ? "hidden" : false,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
