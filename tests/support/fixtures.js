// Shared Playwright fixtures for every spec.
//
// - Google Fonts are stubbed (empty CSS / empty font body), and any other off-site
//   request is aborted and fails the test, so the suite never touches the network.
// - Any console error or uncaught page error fails the test.
import { test as base, expect } from "@playwright/test";

const FONT_CSS_HOST = "fonts.googleapis.com";
const FONT_FILE_HOST = "fonts.gstatic.com";

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const siteOrigin = new URL(baseURL).origin;
    const offsite = [];

    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === siteOrigin) return route.fallback();
      if (url.hostname === FONT_CSS_HOST) {
        return route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body: "" });
      }
      if (url.hostname === FONT_FILE_HOST) {
        return route.fulfill({ status: 200, contentType: "font/woff2", body: "" });
      }
      offsite.push(url.href);
      return route.abort("blockedbyclient");
    });

    await use(context);

    expect(offsite, "the page made unexpected off-site requests").toEqual([]);
  },

  page: async ({ page }, use) => {
    const problems = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const { url, lineNumber } = msg.location();
      problems.push(`console.error: ${msg.text()}${url ? ` (${url}:${lineNumber})` : ""}`);
    });
    page.on("pageerror", (err) => {
      problems.push(`pageerror: ${err.stack || err.message}`);
    });

    await use(page);

    expect(problems, "the page logged errors").toEqual([]);
  },
});

export { expect };
