import { test, expect } from "./support/fixtures.js";
import {
  TOTAL,
  answerQuestions,
  contrast,
  counter,
  expectNoHorizontalScroll,
  luminance,
  openPage,
  option,
  parseRgb,
  retakeButton,
  screen,
  startButton,
  startQuiz,
} from "./support/quiz.js";

for (const width of [360, 400]) {
  test.describe(`narrow screens: ${width}px wide`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("intro, every question and the result fit without horizontal scrolling", async ({ page }) => {
      await openPage(page);
      await expectNoHorizontalScroll(page, width);

      await startButton(page).click();
      await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
      // Mix of answers so the result has every kind of bar and review entry.
      await answerQuestions(page, "AVFSAVFSAVFSAVF", {
        onQuestion: async () => {
          await expectNoHorizontalScroll(page, width);
        },
      });

      await expect(screen(page, "result")).toBeVisible();
      await expectNoHorizontalScroll(page, width);
      await page.getByText("Review your answers", { exact: true }).click();
      await expect(page.locator("#review-list > li")).toHaveCount(TOTAL);
      await expect(page.locator("#review-list > li").last()).toBeVisible();
      await expectNoHorizontalScroll(page, width);
    });
  });
}

test.describe("phone-sized touch screen", () => {
  // The mobile project covers this too; here it also runs under the desktop project.
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test("the page is laid out at the device width, not as a zoomed-out desktop page", async ({ page }) => {
    await openPage(page);
    await expectNoHorizontalScroll(page, 360);
    expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  });
});

test.describe("short screen", () => {
  test.use({ viewport: { width: 360, height: 400 } });

  test("each screen change starts at the top of the page", async ({ page }) => {
    const scrollY = () => page.evaluate(() => window.scrollY);
    const scrollToBottom = async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(scrollY, "the page is tall enough to scroll").toBeGreaterThan(0);
    };

    await openPage(page);
    await scrollToBottom();
    await startButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect.poll(scrollY, "intro -> quiz").toBe(0);

    await answerQuestions(page, "S".repeat(TOTAL - 1));
    await scrollToBottom();
    await option(page, "A").click();
    await expect(screen(page, "result")).toBeVisible();
    await expect.poll(scrollY, "quiz -> result").toBe(0);
    await expect(page.locator("#score-num")).toBeInViewport();

    await scrollToBottom();
    await retakeButton(page).click();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect.poll(scrollY, "result -> quiz").toBe(0);
  });
});

test.describe("with motion allowed", () => {
  // The rest of the suite runs with reduced motion, which turns the animations off.
  test.use({ reducedMotion: "no-preference" });

  test("the question fades in fully and the result bars grow to their width", async ({ page }) => {
    await startQuiz(page);
    await option(page, "S").click();
    await expect(counter(page)).toHaveText(`Question 2 of ${TOTAL}`);
    const question = page.locator("#question");
    // The animated path really runs here.
    expect(await question.evaluate((el) => getComputedStyle(el).animationName)).toBe("enter");
    await expect.poll(() => question.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

    await answerQuestions(page, "S".repeat(TOTAL - 1), { from: 2 });
    await expect(screen(page, "result")).toBeVisible();
    await expect
      .poll(() =>
        page.locator('#breakdown .bd-row[data-type="S"]').evaluate((row) => {
          const bar = row.querySelector(".bd-bar").getBoundingClientRect().width;
          return bar / row.querySelector(".bd-track").getBoundingClientRect().width;
        }),
      )
      .toBeGreaterThan(0.99);
  });
});

async function colorsOf(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, background: cs.backgroundColor };
  });
}

async function readSchemeColors(page) {
  const body = await colorsOf(page.locator("body"));
  return {
    body,
    lede: (await colorsOf(page.locator(".lede"))).color,
    fine: (await colorsOf(page.locator("#intro .fine"))).color,
    eyebrow: (await colorsOf(page.locator("#intro .eyebrow"))).color,
    pill: await colorsOf(startButton(page)),
  };
}

function expectReadable(colors, scheme) {
  const bg = parseRgb(colors.body.background);
  expect(bg.a, `${scheme}: body has an opaque background`).toBe(1);
  const fg = parseRgb(colors.body.color);
  expect(contrast(fg, bg), `${scheme}: body text contrast`).toBeGreaterThanOrEqual(7);
  for (const part of ["lede", "fine", "eyebrow"]) {
    expect(contrast(parseRgb(colors[part]), bg), `${scheme}: ${part} contrast`).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(parseRgb(colors.pill.color), parseRgb(colors.pill.background)), `${scheme}: start button contrast`).toBeGreaterThanOrEqual(4.5);
}

test.describe("dark mode", () => {
  test("the dark color scheme swaps the page colors and keeps text readable", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openPage(page);
    const light = await readSchemeColors(page);
    expectReadable(light, "light");
    expect(luminance(parseRgb(light.body.background))).toBeGreaterThan(luminance(parseRgb(light.body.color)));

    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(() => page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(light.body.background);
    const dark = await readSchemeColors(page);
    expectReadable(dark, "dark");

    expect(dark.body.background).not.toBe(light.body.background);
    expect(dark.body.color).not.toBe(light.body.color);
    // Dark means light text on a dark background.
    expect(luminance(parseRgb(dark.body.background))).toBeLessThan(luminance(parseRgb(dark.body.color)));
    expect(luminance(parseRgb(dark.body.background))).toBeLessThan(0.05);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  });

  test.describe("loaded in dark mode", () => {
    test.use({ colorScheme: "dark" });

    test("question options and the result stay readable", async ({ page }) => {
      await startQuiz(page);
      const bg = parseRgb(await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor));
      expect(luminance(bg)).toBeLessThan(0.05);

      const opt = await colorsOf(page.locator("#options .opt").first());
      expect(contrast(parseRgb(opt.color), parseRgb(opt.background))).toBeGreaterThanOrEqual(7);

      await answerQuestions(page, "SSSSSSSSSSSSSSA");
      await expect(screen(page, "result")).toBeVisible();
      const name = await colorsOf(page.locator("#style-name"));
      expect(contrast(parseRgb(name.color), bg)).toBeGreaterThanOrEqual(7);
      const you = await colorsOf(page.locator("#result-key tr.is-you td"));
      expect(contrast(parseRgb(you.color), parseRgb(you.background))).toBeGreaterThanOrEqual(7);
      const lean = await colorsOf(page.locator("#lean"));
      expect(contrast(parseRgb(lean.color), parseRgb(lean.background))).toBeGreaterThanOrEqual(4.5);
    });
  });
});
