import { defineConfig, devices } from "@playwright/test";

/**
 * App-local E2E (FND-11 task 8): `pnpm --filter @laif/clinical-web test:e2e`. Runs against the
 * production build served by `vite preview` on the app's port, built with `VITE_LAIF_E2E=1`
 * (no simulated latency). Specs live in `e2e/`; REL-03 adds the cross-app suites.
 */
const PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // CLN-11: the route sweeps (a11y / responsive) visit every screen; allow for a loaded machine.
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vite build && vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/clinical/login`,
    env: { VITE_LAIF_E2E: "1" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
