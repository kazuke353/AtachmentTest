// @ts-check
import { defineConfig, devices } from "@playwright/test";

const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  // For private repositories GitHub's ubuntu-latest runner has 2 vCPUs, where Playwright's default
  // (half the CPUs) would be a single worker. The suite mostly waits, so 2 workers are safe there.
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    // The page animates option changes and result bars; tests run with motion reduced.
    reducedMotion: "reduce",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Unset in CI (Playwright's own Chromium is installed there). Locally it can point
      // at a preinstalled Chromium build, e.g. /opt/pw-browsers/chromium.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // The static-server checks do not involve a browser, so one run is enough.
      testIgnore: /server\.spec\.js$/,
    },
  ],

  webServer: {
    command: "node scripts/serve.mjs",
    url: BASE_URL,
    // serve.mjs binds to HOST when it is set; pin it so a HOST exported in the shell cannot move
    // the server away from the 127.0.0.1 address the readiness check and the tests use.
    env: { PORT: String(PORT), HOST: "127.0.0.1" },
    // Never attach to a server that is already running: a parallel run on another
    // port (or a stale server) must not be tested by mistake.
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30_000,
  },
});
