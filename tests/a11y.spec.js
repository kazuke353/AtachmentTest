import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./support/fixtures.js";
import {
  TOTAL,
  answerQuestions,
  backButton,
  contrast,
  counter,
  openPage,
  option,
  options,
  parseRgb,
  screen,
  startButton,
  startQuiz,
} from "./support/quiz.js";

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

// axe's WCAG A/AA rules do not check focus indicators (WCAG 2.4.7, 1.4.11), so check the ring itself:
// drawn, at least 2px, and at least 3:1 against what it sits on.
async function expectVisibleFocusRing(locator, label) {
  const ring = await locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    // A negative offset draws the ring inside the element, on the element's own background.
    const under = Number.parseFloat(cs.outlineOffset) < 0 ? cs.backgroundColor : getComputedStyle(document.body).backgroundColor;
    return { style: cs.outlineStyle, width: Number.parseFloat(cs.outlineWidth), color: cs.outlineColor, under };
  });
  expect(ring.style, `${label}: focus outline style`).not.toBe("none");
  expect(ring.width, `${label}: focus outline width`).toBeGreaterThanOrEqual(2);
  expect(contrast(parseRgb(ring.color), parseRgb(ring.under)), `${label}: focus ring ${ring.color} on ${ring.under}`).toBeGreaterThanOrEqual(3);
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

    test("keyboard focus is visibly outlined on the start button and on an option", async ({ page }) => {
      await openPage(page);
      await page.keyboard.press("Tab");
      await expect(startButton(page)).toBeFocused();
      await expectVisibleFocusRing(startButton(page), `start button (${colorScheme})`);

      await page.keyboard.press("Enter");
      await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
      await expect(page.locator("#scenario")).toBeFocused();
      await page.keyboard.press("Tab"); // from the focused scenario to option A
      await expect(options(page).first()).toBeFocused();
      await expectVisibleFocusRing(options(page).first(), `option A (${colorScheme})`);
    });

    test("keyboard focus stays visible on a selected answer", async ({ page }) => {
      await startQuiz(page);
      await page.keyboard.press("1"); // answer question 1 with option A
      await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
      await page.keyboard.press("ArrowLeft");
      await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
      await expect(options(page).first()).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Tab"); // from the focused scenario to the selected option A
      await expect(options(page).first()).toBeFocused();
      await expectVisibleFocusRing(options(page).first(), `selected option A (${colorScheme})`);
    });
  });
}

test("the question counter is a polite live region, so screen readers hear each new question", async ({ page }) => {
  await startQuiz(page);
  await expect(counter(page)).toHaveAttribute("aria-live", "polite");
  await option(page, "S").click();
  await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
  await expect(counter(page)).toHaveAttribute("aria-live", "polite");
});
