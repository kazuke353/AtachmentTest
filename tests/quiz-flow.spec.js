import { test, expect } from "./support/fixtures.js";
import {
  TOTAL,
  TYPES,
  answerQuestions,
  backButton,
  contrast,
  counter,
  openPage,
  option,
  options,
  parseRgb,
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

  test("the pause after a choice shows it pressed, ignores other input, then advances after 240ms", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await startQuiz(page);
    // Stop the page's timers so the pause can be inspected step by step.
    await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));

    await option(page, "V").click();
    await expect(option(page, "V")).toHaveAttribute("aria-pressed", "true");
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);

    // Input during the pause is ignored: another option, Back, and the shortcut keys.
    await option(page, "S").click();
    await backButton(page).click();
    await page.keyboard.press("2");
    await page.keyboard.press("ArrowLeft");
    await expect(screen(page, "quiz")).toBeVisible();
    await expect(option(page, "S")).toHaveAttribute("aria-pressed", "false");
    await expect(option(page, "V")).toHaveAttribute("aria-pressed", "true");

    await page.clock.runFor(200);
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await page.clock.runFor(40);
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(screen(page, "quiz")).toBeVisible();
    expect((await storedState(page)).answers.slice(0, 2)).toEqual(["V", null]);
  });

  test("a chosen answer is still pressed, and visibly highlighted, after going back", async ({ page }) => {
    await startQuiz(page);
    await option(page, "V").click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(page.locator("#scenario")).toBeFocused();
    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(option(page, "V")).toHaveAttribute("aria-pressed", "true");
    for (const t of ["S", "A", "F"]) await expect(option(page, t)).toHaveAttribute("aria-pressed", "false");

    // The selection is drawn, not only an attribute: it stands out from the other options and stays readable.
    await page.mouse.move(0, 0);
    const look = (choice) =>
      option(page, choice).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, background: cs.backgroundColor };
      });
    const picked = await look("V");
    expect(contrast(parseRgb(picked.color), parseRgb(picked.background)), "selected option text contrast").toBeGreaterThanOrEqual(4.5);
    for (const t of ["S", "A", "F"]) {
      const other = await look(t);
      expect(contrast(parseRgb(picked.background), parseRgb(other.background)), `selected V stands out from ${t}`).toBeGreaterThanOrEqual(3);
    }
  });

  test("each question gets its own random option order, and every type can land in every position", async ({ page }) => {
    await openPage(page);
    const orders = [];
    for (let run = 0; run < 4; run++) {
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await startButton(page).click();
      await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
      const state = await storedState(page);
      expect(state.orders).toHaveLength(TOTAL);
      // What is stored is what is shown.
      expect((await readQuestion(page)).order).toEqual(state.orders[0]);
      // Questions do not share one order (15 shuffles giving at most 2 distinct orders: about 2e-14).
      expect(new Set(state.orders.map((o) => o.join(""))).size, "distinct option orders in one quiz").toBeGreaterThan(2);
      orders.push(...state.orders);
    }
    // 60 shuffles: every type lands in every position (a miss by chance: 16 * (3/4)^60, about 5e-7).
    for (const t of TYPES) {
      for (let p = 0; p < 4; p++) {
        expect(orders.some((o) => o[p] === t), `${t} appears at position ${p + 1}`).toBe(true);
      }
    }
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
    await expect(startButton(page)).toBeFocused();
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
