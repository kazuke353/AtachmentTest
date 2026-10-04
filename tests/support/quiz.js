// Black-box helpers for driving the quiz page through its real UI.
import { expect } from "./fixtures.js";

export const TOTAL = 15;
export const STORE_KEY = "attachment-style-test:v1";
export const TYPES = ["S", "A", "V", "F"];
export const TYPE_NAMES = { S: "Secure", A: "Anxious", V: "Avoidant", F: "Fearful" };

// The scoring key as published on the page (en dash in the ranges).
export const BANDS = [
  { min: 0, max: 3, range: "0–3", label: "Anxious-preoccupied", text: /^Relationships take up a lot of your mental energy\./ },
  { min: 4, max: 7, range: "4–7", label: "Fearful-avoidant", text: /^You want closeness and you're wary of it at the same time\./ },
  { min: 8, max: 10, range: "8–10", label: "Leaning anxious", text: /^You value closeness and you're willing to work for it/ },
  { min: 11, max: 13, range: "11–13", label: "Mostly secure", text: /^Trust and direct communication are your defaults\./ },
  { min: 14, max: 15, range: "14–15", label: "Securely attached", text: /^You're comfortable being close to people and comfortable on your own\./ },
];

export const bandFor = (score) => BANDS.find((b) => score >= b.min && score <= b.max);

/** Build a 15-letter answer plan from per-type counts, interleaving the types. */
export function makePlan({ S = 0, A = 0, V = 0, F = 0 }) {
  const left = { S, A, V, F };
  if (S + A + V + F !== TOTAL) throw new Error(`plan must have ${TOTAL} answers, got ${S + A + V + F}`);
  let plan = "";
  while (plan.length < TOTAL) {
    for (const t of TYPES) {
      if (left[t] > 0) {
        plan += t;
        left[t] -= 1;
      }
    }
  }
  return plan;
}

export function countPlan(plan) {
  const counts = { S: 0, A: 0, V: 0, F: 0 };
  for (const t of plan) counts[t] += 1;
  return counts;
}

export function assertPlan(plan) {
  if (!/^[SAVF]*$/.test(plan)) throw new Error(`invalid plan "${plan}"`);
  return plan;
}

// Locators
export const screen = (page, name) => page.locator(`#${name}`);
export const counter = (page) => page.locator("#count");
export const options = (page) => page.locator("#options .opt");
export const option = (page, choice) => page.locator(`#options .opt[data-choice="${choice}"]`);
export const startButton = (page) => page.locator("#start");
export const restartButton = (page) => page.locator("#restart");
export const backButton = (page) => page.locator("#back");
export const retakeButton = (page) => page.locator("#retake");

/** Open the page on a clean slate (each test gets a fresh browser context). */
export async function openPage(page) {
  await page.goto("/");
  await expect(screen(page, "intro")).toBeVisible();
}

export async function startQuiz(page) {
  await openPage(page);
  await expect(startButton(page)).toHaveText("Take the test");
  await startButton(page).click();
  await expect(screen(page, "quiz")).toBeVisible();
  await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
}

/** Snapshot of the current question as rendered: scenario, option order and texts. */
export async function readQuestion(page) {
  return page.locator("#quiz").evaluate((quiz) => {
    const opts = [...quiz.querySelectorAll("#options .opt")];
    return {
      counter: quiz.querySelector("#count").textContent,
      scenario: quiz.querySelector("#scenario").textContent,
      order: opts.map((b) => b.dataset.choice),
      letters: opts.map((b) => b.querySelector(".letter")?.textContent ?? ""),
      texts: Object.fromEntries(opts.map((b) => [b.dataset.choice, b.querySelector(".text")?.textContent ?? ""])),
      pressed: opts.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.choice),
    };
  });
}

/**
 * Answer questions `from`..`from + plan.length - 1` by data-choice (option order is random).
 * Waits for each question with a web-first assertion on the counter, and after the last
 * answer waits for the page to move on (the page ignores input during its short advance
 * delay, so callers must not act before it settles). Returns what was shown.
 */
export async function answerQuestions(page, plan, { from = 1, onQuestion } = {}) {
  assertPlan(plan);
  const shown = [];
  for (let k = 0; k < plan.length; k++) {
    const n = from + k;
    await expect(counter(page)).toHaveText(`Question ${n} of ${TOTAL}`);
    const q = await readQuestion(page);
    if (onQuestion) await onQuestion(n, q);
    const choice = plan[k];
    await option(page, choice).click();
    shown.push({ n, choice, ...q });
  }
  if (plan.length > 0) await waitForAdvanceFrom(page, from + plan.length - 1);
  return shown;
}

/** Wait until the page has left question `n` (to the next question, an earlier gap, or the result). */
export async function waitForAdvanceFrom(page, n) {
  if (n < TOTAL) {
    await expect(counter(page)).toHaveText(`Question ${n + 1} of ${TOTAL}`);
    return;
  }
  // #result is always in the DOM (only hidden), so only a visible one counts; otherwise the
  // jump back to an earlier gap would match two elements and break strict mode.
  const leftLastQuestion = screen(page, "result")
    .filter({ visible: true })
    .or(counter(page).filter({ hasNotText: `Question ${TOTAL} of ${TOTAL}` }));
  await expect(leftLastQuestion).toBeVisible();
}

/** Start from a fresh page, answer all 15 questions from a 15-letter plan, land on the result. */
export async function completeQuiz(page, plan, opts = {}) {
  assertPlan(plan);
  if (plan.length !== TOTAL) throw new Error(`plan must be ${TOTAL} letters, got "${plan}"`);
  await startQuiz(page);
  const shown = await answerQuestions(page, plan, opts);
  await expect(screen(page, "result")).toBeVisible();
  await expect(screen(page, "quiz")).toBeHidden();
  return shown;
}

/** The page's persisted state (read only to check that resets really clear it). */
export async function storedState(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  }, STORE_KEY);
}

export async function setStoredRaw(page, raw) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORE_KEY, raw]);
}

export async function expectNoHorizontalScroll(page, width) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
  }));
  const where = `at ${width}px: ${JSON.stringify(m)}`;
  // innerWidth must stay at the device width (a zoomed-out mobile viewport would hide overflow).
  expect(m.innerWidth, where).toBe(width);
  expect(m.scrollWidth, where).toBeLessThanOrEqual(m.innerWidth);
  expect(m.scrollWidth, where).toBeLessThanOrEqual(m.clientWidth);
  expect(m.bodyScrollWidth, where).toBeLessThanOrEqual(m.clientWidth);
}

// Colour helpers for contrast checks.
export function parseRgb(css) {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (!m) throw new Error(`cannot parse colour "${css}"`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

export function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
