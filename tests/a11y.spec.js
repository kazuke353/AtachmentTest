import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./support/fixtures.js";
import { TOTAL, answerQuestions, backButton, counter, openPage, option, screen, startQuiz } from "./support/quiz.js";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoAxeViolations(page, label) {
  // Keep the pointer off the content so :hover styles do not depend on where the last click landed.
  await page.mouse.move(0, 0);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => `${n.target.join(" ")} :: ${n.failureSummary}`),
  }));
  expect(summary, `axe violations on ${label}`).toEqual([]);
  // The scan must actually have examined the page.
  expect(results.passes.length, `axe ran rules on ${label}`).toBeGreaterThan(0);
}

for (const colorScheme of ["light", "dark"]) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });

    test("intro screen has no WCAG A/AA violations", async ({ page }) => {
      await openPage(page);
      await expectNoAxeViolations(page, `intro (${colorScheme})`);
    });

    test("question screen has no WCAG A/AA violations, with and without a selected answer", async ({ page }) => {
      await startQuiz(page);
      await expectNoAxeViolations(page, `question 1 (${colorScheme})`);

      await option(page, "A").click();
      await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
      await backButton(page).click();
      await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
      await expect(option(page, "A")).toHaveAttribute("aria-pressed", "true");
      await expectNoAxeViolations(page, `question 1 answered (${colorScheme})`);
    });

    test("result screen with the review expanded has no WCAG A/AA violations", async ({ page }) => {
      await startQuiz(page);
      await answerQuestions(page, "SAVFSSSVSSFSASS");
      await expect(screen(page, "result")).toBeVisible();
      await page.getByText("Review your answers", { exact: true }).click();
      await expect(page.locator("#review")).toHaveAttribute("open");
      await expect(page.locator("#review-list > li")).toHaveCount(TOTAL);
      await expect(page.locator("#review-list > li").last()).toBeVisible();
      await expectNoAxeViolations(page, `result (${colorScheme})`);
    });
  });
}
