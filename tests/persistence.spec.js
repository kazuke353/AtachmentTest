import { test, expect } from "./support/fixtures.js";
import {
  STORE_KEY,
  TOTAL,
  TYPES,
  answerQuestions,
  backButton,
  completeQuiz,
  counter,
  openPage,
  option,
  options,
  readQuestion,
  restartButton,
  retakeButton,
  screen,
  setStoredRaw,
  startButton,
  startQuiz,
  storedState,
} from "./support/quiz.js";

const PLAN = "SVASFSSASVSFSSA";
const PLAN_SCORE = 8; // secure answers in PLAN -> "Leaning anxious"

async function readResult(page) {
  return {
    score: await page.locator("#score-num").textContent(),
    band: await page.locator("#style-name").textContent(),
    lean: await page.locator("#lean").textContent(),
    counts: await page.locator("#breakdown .bd-count").allTextContents(),
    highlighted: await page.locator("#result-key tr.is-you .range").allTextContents(),
  };
}

function expectFreshState(state, previous) {
  expect(state).not.toBeNull();
  expect(state.screen).toBe("quiz");
  expect(state.idx).toBe(0);
  expect(state.answers).toEqual(Array(TOTAL).fill(null));
  expect(state.orders).toHaveLength(TOTAL);
  for (const order of state.orders) expect([...order].sort()).toEqual([...TYPES].sort());
  // A new random option order is drawn (the odds of all 15 matching by chance are ~1e-21).
  if (previous) expect(state.orders).not.toEqual(previous.orders);
}

async function expectQuestionOneUnanswered(page) {
  await expect(screen(page, "quiz")).toBeVisible();
  await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
  await expect(page.locator('#options .opt[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator("#ticks .tick.done")).toHaveCount(0);
}

test.describe("persistence across reloads", () => {
  test("an unfinished quiz resumes on the right question with its answers and option order", async ({ page }) => {
    await startQuiz(page);
    const shown = await answerQuestions(page, PLAN.slice(0, 5));
    await expect(counter(page)).toHaveText(`Question 6 of ${TOTAL}`);
    const q6 = await readQuestion(page);

    await page.reload();

    await expect(screen(page, "quiz")).toBeVisible();
    await expect(counter(page)).toHaveText(`Question 6 of ${TOTAL}`);
    const q6Again = await readQuestion(page);
    expect(q6Again.scenario).toBe(q6.scenario);
    expect(q6Again.order).toEqual(q6.order);
    expect(q6Again.pressed).toEqual([]);
    await expect(page.locator("#ticks .tick.done")).toHaveCount(5);

    for (let n = 5; n >= 1; n--) {
      await backButton(page).click();
      await expect(counter(page)).toHaveText(`Question ${n} of ${TOTAL}`);
      const q = await readQuestion(page);
      expect(q.scenario).toBe(shown[n - 1].scenario);
      expect(q.order, `option order of question ${n} survives the reload`).toEqual(shown[n - 1].order);
      expect(q.pressed).toEqual([shown[n - 1].choice]);
    }

    // And the rest of the quiz still completes normally.
    await option(page, shown[0].choice).click();
    await answerQuestions(page, PLAN.slice(1), { from: 2 });
    await expect(screen(page, "result")).toBeVisible();
    await expect(page.locator("#score-num")).toHaveText(String(PLAN_SCORE));
  });

  test("a finished result is still shown after a reload, with the same score", async ({ page }) => {
    const shown = await completeQuiz(page, PLAN);
    const before = await readResult(page);
    expect(before.score).toBe(String(PLAN_SCORE));
    expect(before.band).toBe("Leaning anxious");

    await page.reload();

    await expect(screen(page, "result")).toBeVisible();
    await expect(screen(page, "intro")).toBeHidden();
    await expect(screen(page, "quiz")).toBeHidden();
    expect(await readResult(page)).toEqual(before);

    await page.getByText("Review your answers", { exact: true }).click();
    const items = page.locator("#review-list > li");
    await expect(items).toHaveCount(TOTAL);
    for (let k = 0; k < TOTAL; k++) {
      // The first tag in each review entry is the answer that was picked.
      await expect(items.nth(k).locator(".r-tag").first()).toHaveAttribute("data-type", shown[k].choice);
      await expect(items.nth(k).locator(".r-text").first()).toHaveText(shown[k].texts[shown[k].choice]);
    }
  });

  test("returning to the intro mid-quiz survives a reload", async ({ page }) => {
    await startQuiz(page);
    await answerQuestions(page, "AV");
    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await backButton(page).click();
    await expect(screen(page, "intro")).toBeVisible();

    await page.reload();

    await expect(screen(page, "intro")).toBeVisible();
    await expect(startButton(page)).toHaveText("Continue at question 1");
    await expect(restartButton(page)).toBeVisible();
    await startButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(option(page, "A")).toHaveAttribute("aria-pressed", "true");
  });

  test("going back is remembered across a reload", async ({ page }) => {
    await startQuiz(page);
    await answerQuestions(page, "SAV");
    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 3 of ${TOTAL}`);
    await backButton(page).click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);

    // Back saves the question it lands on. Without that save the reload would resume on
    // question 4, the last index stored while answering.
    await page.reload();
    await expect(screen(page, "quiz")).toBeVisible();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(option(page, "A")).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("starting again", () => {
  test("Start over on the intro clears every answer", async ({ page }) => {
    await startQuiz(page);
    await answerQuestions(page, "SAV");
    const before = await storedState(page);
    expect(before.answers.slice(0, 3)).toEqual(["S", "A", "V"]);
    for (let n = 3; n >= 1; n--) {
      await backButton(page).click();
      await expect(counter(page)).toHaveText(`Question ${n} of ${TOTAL}`);
    }
    await backButton(page).click();
    await expect(screen(page, "intro")).toBeVisible();

    await page.getByRole("button", { name: "Start over" }).click();

    await expectQuestionOneUnanswered(page);
    await expect(page.locator("#scenario")).toBeFocused();
    expectFreshState(await storedState(page), before);
    // Nothing answered any more, so the intro is back to a plain start.
    await backButton(page).click();
    await expect(startButton(page)).toHaveText("Take the test");
    await expect(restartButton(page)).toBeHidden();

    await page.reload();
    await expect(screen(page, "intro")).toBeVisible();
    await expect(startButton(page)).toHaveText("Take the test");
  });

  test("Take it again on the result clears every answer", async ({ page }) => {
    await completeQuiz(page, PLAN);
    const before = await storedState(page);
    expect(before.screen).toBe("result");
    expect(before.answers.join("")).toBe(PLAN);

    await retakeButton(page).click();

    await expect(screen(page, "result")).toBeHidden();
    await expectQuestionOneUnanswered(page);
    await expect(page.locator("#scenario")).toBeFocused();
    expectFreshState(await storedState(page), before);

    // The fresh quiz does not resurrect the old answers on later questions either.
    await option(page, "F").click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    await expect(page.locator('#options .opt[aria-pressed="true"]')).toHaveCount(0);

    await page.reload();
    await expect(screen(page, "quiz")).toBeVisible();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    expect((await storedState(page)).answers).toEqual(["F", ...Array(TOTAL - 1).fill(null)]);
  });
});

test.describe("robustness against bad stored state", () => {
  const validShape = () => ({
    screen: "quiz",
    idx: 2,
    answers: Array(TOTAL).fill(null),
    orders: Array.from({ length: TOTAL }, () => ["S", "A", "V", "F"]),
  });
  const BAD = {
    "not JSON": "{oops",
    "truncated JSON": '{"screen":"quiz","idx":',
    "JSON null": "null",
    "a number": "42",
    "a string": '"result"',
    "an array": "[]",
    "an empty object": "{}",
    "unknown screen": JSON.stringify({ ...validShape(), screen: "bogus" }),
    "index out of range": JSON.stringify({ ...validShape(), idx: TOTAL }),
    "negative index": JSON.stringify({ ...validShape(), idx: -1 }),
    "fractional index": JSON.stringify({ ...validShape(), idx: 1.5 }),
    "string index": JSON.stringify({ ...validShape(), idx: "2" }),
    "too few answers": JSON.stringify({ ...validShape(), answers: Array(TOTAL - 1).fill("S") }),
    "too many answers": JSON.stringify({ ...validShape(), answers: Array(TOTAL + 1).fill(null) }),
    "unknown answer letter": JSON.stringify({ ...validShape(), answers: ["X", ...Array(TOTAL - 1).fill(null)] }),
    "answers not an array": JSON.stringify({ ...validShape(), answers: "SSSSSSSSSSSSSSS" }),
    "missing orders": JSON.stringify({ ...validShape(), orders: undefined }),
    "order with a duplicate": JSON.stringify({
      ...validShape(),
      orders: [["S", "S", "A", "V"], ...validShape().orders.slice(1)],
    }),
    "order too short": JSON.stringify({ ...validShape(), orders: [["S", "A", "V"], ...validShape().orders.slice(1)] }),
    "order too long": JSON.stringify({ ...validShape(), orders: [["S", "A", "V", "F", "S"], ...validShape().orders.slice(1)] }),
  };

  for (const [name, raw] of Object.entries(BAD)) {
    test(`ignores stored state that is ${name}`, async ({ page }) => {
      await openPage(page);
      await setStoredRaw(page, raw);
      await page.reload();

      await expect(screen(page, "intro")).toBeVisible();
      await expect(screen(page, "quiz")).toBeHidden();
      await expect(screen(page, "result")).toBeHidden();
      await expect(startButton(page)).toHaveText("Take the test");
      await expect(restartButton(page)).toBeHidden();

      await startButton(page).click();
      await expectQuestionOneUnanswered(page);
      await expect(options(page)).toHaveCount(4);
      await option(page, "S").click();
      await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
      const state = await storedState(page);
      expect(state.answers[0]).toBe("S");
      expect(state.answers.slice(1)).toEqual(Array(TOTAL - 1).fill(null));
    });
  }

  test("a stored result with missing answers resumes at the first unanswered question", async ({ page }) => {
    await startQuiz(page);
    await answerQuestions(page, "SAVF");
    await expect(counter(page)).toHaveText(`Question 5 of ${TOTAL}`);
    const state = await storedState(page);
    await setStoredRaw(page, JSON.stringify({ ...state, screen: "result", idx: 0 }));

    await page.reload();

    await expect(screen(page, "result")).toBeHidden();
    await expect(screen(page, "quiz")).toBeVisible();
    await expect(counter(page)).toHaveText(`Question 5 of ${TOTAL}`);
    await expect(page.locator('#options .opt[aria-pressed="true"]')).toHaveCount(0);
    await answerQuestions(page, "S".repeat(TOTAL - 4), { from: 5 });
    await expect(screen(page, "result")).toBeVisible();
    await expect(page.locator("#score-num")).toHaveText(String(1 + (TOTAL - 4)));
  });

  test("a stored result with a gap in the middle asks that question again", async ({ page }) => {
    const plan = "SAVFSAVFSAVFSAV";
    await completeQuiz(page, plan);
    const state = await storedState(page);
    const answers = [...state.answers];
    answers[6] = null;
    await setStoredRaw(page, JSON.stringify({ ...state, answers }));

    await page.reload();

    await expect(screen(page, "quiz")).toBeVisible();
    await expect(counter(page)).toHaveText(`Question 7 of ${TOTAL}`);
    await expect(page.locator('#options .opt[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator("#ticks .tick.done")).toHaveCount(TOTAL - 1);
    // Answer the gap with S, then confirm the remaining stored answers to reach the result.
    await answerQuestions(page, "S" + plan.slice(7), { from: 7 });
    await expect(screen(page, "result")).toBeVisible();
    const expectedScore = [...("SAVFSA" + "S" + plan.slice(7))].filter((c) => c === "S").length;
    await expect(page.locator("#score-num")).toHaveText(String(expectedScore));
  });

  test("answering the last question with an earlier gap jumps back to the gap", async ({ page }) => {
    await startQuiz(page);
    const state = await storedState(page);
    const answers = Array(TOTAL).fill("S");
    answers[6] = null;
    answers[14] = null;
    await setStoredRaw(page, JSON.stringify({ ...state, screen: "quiz", idx: 14, answers }));
    await page.reload();
    await expect(counter(page)).toHaveText(`Question 15 of ${TOTAL}`);

    await answerQuestions(page, "A", { from: 15 });
    await expect(screen(page, "result")).toBeHidden();
    await expect(counter(page)).toHaveText(`Question 7 of ${TOTAL}`);
    await expect(page.locator('#options .opt[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator("#scenario")).toBeFocused();

    await answerQuestions(page, "V" + "S".repeat(7) + "A", { from: 7 });
    await expect(screen(page, "result")).toBeVisible();
    await expect(page.locator("#score-num")).toHaveText("13");
  });

  test("a stored result with no answers at all starts from question 1", async ({ page }) => {
    await startQuiz(page);
    const state = await storedState(page);
    await setStoredRaw(page, JSON.stringify({ ...state, screen: "result", idx: 9 }));
    await page.reload();
    await expectQuestionOneUnanswered(page);
  });

  test("works without usable localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("Storage is disabled", "SecurityError");
        },
      });
    });
    await completeQuiz(page, "SSSSSSSSSSSSAVF");
    await expect(page.locator("#score-num")).toHaveText("12");
    await expect(page.locator("#style-name")).toHaveText("Mostly secure");
    await page.reload();
    // Nothing could be saved, so a reload starts over cleanly.
    await expect(screen(page, "intro")).toBeVisible();
    await expect(startButton(page)).toHaveText("Take the test");
  });
});

test("the storage key is the documented one", async ({ page }) => {
  await startQuiz(page);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual([STORE_KEY]);
});
