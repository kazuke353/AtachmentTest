# The Attachment Style Test

A single static web page with a 15-question quiz about how you tend to react in close relationships. Each question describes a scenario and offers four reactions. The page counts your secure answers, places the score in a band (from anxious-preoccupied to securely attached), and shows a breakdown and a review of your answers. Progress is saved in your browser's localStorage and is not sent anywhere. It is a self-reflection quiz, not a clinical assessment.

## Project layout

```
site/index.html               the whole quiz (HTML, CSS and JavaScript in one file); site/ is published as-is
tests/                        Playwright tests (shared helpers in tests/support/)
scripts/serve.mjs             small static server for site/, used by the tests and for local preview
playwright.config.js          test configuration; starts scripts/serve.mjs on its own
.github/workflows/pages.yml   CI: runs the tests on every push, deploys main to GitHub Pages
```

There is no build step.

## Run locally

Needs Node.js 20 or later (CI uses Node 24).

```sh
npm ci
npx playwright install chromium
npm test
```

On Linux, `npx playwright install --with-deps chromium` also installs the system libraries Chromium needs.

`npm test` starts its own server on port 4173 and will not reuse one that is already running, so stop `npm run serve` first or set `PORT` to another port. To test with a Chromium you already have, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path.

To preview the page, run `npm run serve` and open http://127.0.0.1:4173.

## CI and deployment

`.github/workflows/pages.yml` runs on every push to any branch. You can also start it from the Actions tab with "Run workflow".

- The `test` job runs `npm ci`, `npx playwright install --with-deps chromium` and `npm test`. The Playwright HTML report is uploaded as the `playwright-report` artifact for 7 days, including when tests fail. To view it, download and unzip it, then run `npx playwright show-report <folder>`.
- On `main` only, once the tests pass, the `deploy` job publishes `site/` to GitHub Pages. The site URL is shown on the run's summary page and in Settings > Pages. Pushes to other branches run the tests and stop there.
- Only one run per branch is in progress at a time. On other branches, a new push cancels the run in progress. On `main`, a run that has started is never cancelled, so a deployment is never cut off. A newer push to `main` replaces any run still waiting to start, so the latest commit is the one deployed.

## One-time setup

Pages must be available for the repository. On GitHub Free that means a public repository. A private one needs GitHub Pro, Team or Enterprise. If Settings > Pages offers to upgrade or to make the repository public, do one of those first, or the deploy job fails on every push to `main`. A Pages site is public even when the repository is private, unless you use private Pages on GitHub Enterprise Cloud.

1. On GitHub, open the repository's Settings > Pages > Build and deployment, and set Source to "GitHub Actions".
2. Merge this workflow into `main`. GitHub runs it on pushes to `main`, and shows the "Run workflow" button, only once the file is on the default branch.

Deploys only run from `main`. If you add protection rules to the `github-pages` environment, keep `main` allowed.
