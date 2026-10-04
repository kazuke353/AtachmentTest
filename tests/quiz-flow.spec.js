import { test, expect } from "./support/fixtures.js";
import {
  TOTAL,
  TYPES,
  answerQuestions,
  backButton,
  counter,
  option,
  options,
  readQuestion,
  restartButton,
  screen,
  startButton,
  startQuiz,
  storedState,
} from "./support/quiz.js";

const ticks = (page) => page.locator("#ticks .tick");

test.describe("question flow", () => {
  test("every question offers S, A, V and F exactly once while the counter and ticks advance", async ({ page }) => {
    await startQuiz(page);
    const scenarios = new Set();
    // Rotate through the types so every kind of answer is exercised.
    const plan = Array.from({ length: TOTAL }, (_, i) => TYPES[i % 4]).join("");

    await answerQuestions(page, plan, {
      onQuestion: async (n, q) => {
        expect(q.counter).toBe(`Question ${n} of ${TOTAL}`);

        // Four options, one per type, labelled A-D in order, nothing pre-selected.
        await expect(options(page)).toHaveCount(4);
        expect([...q.order].sort()).toEqual([...TYPES].sort());
        expect(q.letters).toEqual(["A", "B", "C", "D"]);
        expect(q.pressed).toEqual([]);
        for (let j = 0; j < 4; j++) await expect(options(page).nth(j)).toHaveAttribute("aria-pressed", "false");
        for (const t of TYPES) {
          expect(q.texts[t].trim().length, `option ${t} on question ${n} has text`).toBeGreaterThan(10);
        }
        expect(new Set(Object.values(q.texts)).size, `question ${n} options are distinct`).toBe(4);

        // The options group is named by the scenario.
        expect(q.scenario.trim().length).toBeGreaterThan(10);
        await expect(page.getByRole("group", { name: q.scenario, exact: true })).toBeVisible();
        scenarios.add(q.scenario);

        // Progress ticks: one per question, the earlier ones done, exactly one current.
        await expect(ticks(page)).toHaveCount(TOTAL);
        await expect(page.locator("#ticks .tick.done")).toHaveCount(n - 1);
        await expect(page.locator("#ticks .tick.current")).toHaveCount(1);
        await expect(ticks(page).nth(n - 1)).toHaveClass(/\bcurrent\b/);
        for (let k = 0; k < n - 1; k++) await expect(ticks(page).nth(k)).toHaveClass(/\bdone\b/);
      },
    });

    expect(scenarios.size).toBe(TOTAL);
    await expect(screen(page, "result")).toBeVisible();
    await expect(page.locator("#style-name")).toBeFocused();
  });

  test("choosing an answer marks it pressed before moving on", async ({ page }) => {
    await startQuiz(page);
    await option(page, "V").click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(page.locator("#scenario")).toBeFocused();
    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(option(page, "V")).toHaveAttribute("aria-pressed", "true");
    for (const t of ["S", "A", "F"]) await expect(option(page, t)).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("back button", () => {
  test("returns to the previous question with its answer still selected", async ({ page }) => {
    await startQuiz(page);
    const shown = await answerQuestions(page, "SAVF");
    await expect(counter(page)).toHaveText(`Question 5 of ${TOTAL}`);

    for (let n = 4; n >= 1; n--) {
      await backButton(page).click();
      await expect(counter(page)).toHaveText(`Question ${n} of ${TOTAL}`);
      const q = await readQuestion(page);
      expect(q.scenario).toBe(shown[n - 1].scenario);
      expect(q.order).toEqual(shown[n - 1].order);
      expect(q.pressed).toEqual([shown[n - 1].choice]);
      await expect(option(page, shown[n - 1].choice)).toHaveAttribute("aria-pressed", "true");
      // Answered questions keep their done tick while revisiting.
      await expect(page.locator("#ticks .tick.done")).toHaveCount(4);
    }

    // Changing an earlier answer replaces it and moves forward again.
    await option(page, "F").click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(option(page, "A")).toHaveAttribute("aria-pressed", "true");
    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(option(page, "F")).toHaveAttribute("aria-pressed", "true");
    await expect(option(page, "S")).toHaveAttribute("aria-pressed", "false");
  });

  test("on question 1 returns to the intro, which offers to continue or start over", async ({ page }) => {
    await startQuiz(page);
    await answerQuestions(page, "SAV");
    await expect(counter(page)).toHaveText(`Question 4 of ${TOTAL}`);
    for (let n = 3; n >= 1; n--) {
      await backButton(page).click();
      await expect(counter(page)).toHaveText(`Question ${n} of ${TOTAL}`);
    }
    await backButton(page).click();

    await expect(screen(page, "intro")).toBeVisible();
    await expect(screen(page, "quiz")).toBeHidden();
    await expect(startButton(page)).toHaveText("Continue at question 1");
    await expect(page.getByRole("button", { name: "Continue at question 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
    await expect(restartButton(page)).toBeVisible();

    // Continue picks up where the user was, answers intact.
    await startButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(option(page, "S")).toHaveAttribute("aria-pressed", "true");
    await option(page, "S").click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(option(page, "A")).toHaveAttribute("aria-pressed", "true");
  });

  test("on question 1 with nothing answered, the intro offers a plain start", async ({ page }) => {
    await startQuiz(page);
    await backButton(page).click();
    await expect(screen(page, "intro")).toBeVisible();
    await expect(startButton(page)).toHaveText("Take the test");
    await expect(restartButton(page)).toBeHidden();
  });
});

test.describe("rapid input", () => {
  test("a double-click records one answer and advances one question", async ({ page }) => {
    await startQuiz(page);
    await option(page, "A").dblclick();

    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(page.locator("#ticks .tick.done")).toHaveCount(1);
    await expect(page.locator('#options .opt[aria-pressed="true"]')).toHaveCount(0);
    const state = await storedState(page);
    expect(state.answers.filter((a) => a !== null)).toEqual(["A"]);
    expect(state.answers[0]).toBe("A");

    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(option(page, "A")).toHaveAttribute("aria-pressed", "true");
  });

  test("a double-click on the last question shows the result once", async ({ page }) => {
    await startQuiz(page);
    await answerQuestions(page, "SSSSSSSSSSSSSS");
    await expect(counter(page)).toHaveText(`Question ${TOTAL} of ${TOTAL}`);
    await option(page, "S").dblclick();
    await expect(screen(page, "result")).toBeVisible();
    await expect(page.locator("#score-num")).toHaveText("15");
    await expect(page.locator("#style-name")).toHaveText("Securely attached");
    const state = await storedState(page);
    expect(state.answers).toEqual(Array(TOTAL).fill("S"));
  });
});
