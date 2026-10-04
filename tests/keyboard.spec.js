import { test, expect } from "./support/fixtures.js";
import {
  TOTAL,
  completeQuiz,
  counter,
  openPage,
  options,
  readQuestion,
  screen,
  startQuiz,
  storedState,
} from "./support/quiz.js";

test.describe("keyboard shortcuts", () => {
  test("1-4 and a-d choose the option at that position, ArrowLeft goes back", async ({ page }) => {
    await startQuiz(page);
    const keys = ["1", "b", "3", "d", "a", "2", "c", "4"];
    const picked = [];

    for (let k = 0; k < keys.length; k++) {
      await expect(counter(page)).toHaveText(`Question ${k + 1} of ${TOTAL}`);
      const { order } = await readQuestion(page);
      const position = "1234".includes(keys[k]) ? "1234".indexOf(keys[k]) : "abcd".indexOf(keys[k]);
      picked.push({ position, choice: order[position] });
      await page.keyboard.press(keys[k]);
    }
    await expect(counter(page)).toHaveText(`Question ${keys.length + 1} of ${TOTAL}`);

    const state = await storedState(page);
    expect(state.answers.slice(0, keys.length)).toEqual(picked.map((p) => p.choice));

    for (let k = keys.length - 1; k >= 0; k--) {
      await page.keyboard.press("ArrowLeft");
      await expect(counter(page)).toHaveText(`Question ${k + 1} of ${TOTAL}`);
      for (let j = 0; j < 4; j++) {
        await expect(options(page).nth(j), `question ${k + 1}, position ${j + 1}`).toHaveAttribute(
          "aria-pressed",
          String(j === picked[k].position),
        );
      }
    }

    // ArrowLeft on question 1 behaves like Back: it returns to the intro.
    await page.keyboard.press("ArrowLeft");
    await expect(screen(page, "intro")).toBeVisible();
    await expect(page.locator("#start")).toHaveText("Continue at question 1");
  });

  test("upper-case A-D (Shift or Caps Lock) also choose by position", async ({ page }) => {
    await startQuiz(page);
    const keys = ["B", "Shift+KeyD", "A", "C"];
    const picked = [];
    for (let k = 0; k < keys.length; k++) {
      await expect(counter(page)).toHaveText(`Question ${k + 1} of ${TOTAL}`);
      const { order } = await readQuestion(page);
      picked.push(order["ABCD".indexOf(keys[k].slice(-1))]);
      await page.keyboard.press(keys[k]);
    }
    await expect(counter(page)).toHaveText(`Question ${keys.length + 1} of ${TOTAL}`);
    expect((await storedState(page)).answers.slice(0, keys.length)).toEqual(picked);
  });

  test("the shortcut hint shows with a hover-capable pointer and is hidden on touch screens", async ({ page }, testInfo) => {
    await startQuiz(page);
    const hint = page.getByText("On a keyboard, press 1–4");
    await expect(hint).toHaveCount(1);
    if (testInfo.project.use.hasTouch) await expect(hint).toBeHidden();
    else await expect(hint).toBeVisible();
  });

  test("other keys, and shortcuts with Ctrl, Alt or Meta held, are ignored", async ({ page }) => {
    await startQuiz(page);
    // Answering writes the choice synchronously, so the checks below need no waiting.
    for (const combo of ["Control+1", "Alt+2", "Meta+3", "Control+b", "Control+ArrowLeft"]) {
      await page.keyboard.press(combo);
    }
    // Keys outside 1-4 / a-d do nothing either.
    for (const key of ["e", "5", "0", "ArrowRight"]) {
      await page.keyboard.press(key);
    }
    await expect(screen(page, "quiz")).toBeVisible();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(page.locator('#options .opt[aria-pressed="true"]')).toHaveCount(0);
    expect((await storedState(page)).answers).toEqual(Array(TOTAL).fill(null));

    await page.keyboard.press("2");
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
  });

  test("keys do nothing on the intro screen", async ({ page }) => {
    await openPage(page);
    const before = await storedState(page);
    for (const key of ["1", "2", "3", "4", "a", "b", "c", "d", "ArrowLeft"]) {
      await page.keyboard.press(key);
    }
    await expect(screen(page, "intro")).toBeVisible();
    await expect(screen(page, "quiz")).toBeHidden();
    await expect(page.locator("#start")).toHaveText("Take the test");
    expect(await storedState(page)).toEqual(before);
  });

  test("keys do nothing on the result screen", async ({ page }) => {
    await completeQuiz(page, "SSSSSSSSSSAVFAV");
    await expect(page.locator("#score-num")).toHaveText("10");
    const before = await storedState(page);
    for (const key of ["1", "2", "3", "4", "a", "b", "c", "d", "ArrowLeft"]) {
      await page.keyboard.press(key);
    }
    await expect(screen(page, "result")).toBeVisible();
    await expect(screen(page, "quiz")).toBeHidden();
    await expect(page.locator("#score-num")).toHaveText("10");
    await expect(page.locator("#style-name")).toHaveText("Leaning anxious");
    expect(await storedState(page)).toEqual(before);
  });
});
