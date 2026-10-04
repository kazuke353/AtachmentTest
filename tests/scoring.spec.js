import { test, expect } from "./support/fixtures.js";
import { BANDS, TOTAL, TYPES, TYPE_NAMES, bandFor, completeQuiz, countPlan, makePlan } from "./support/quiz.js";

const DESC = {
  A: "seeking reassurance and worrying about where you stand",
  V: "pulling back, handling things alone and keeping some distance",
  F: "wanting closeness, then withdrawing to protect yourself",
};
const MISMATCH = (names) =>
  ` The score only counts secure answers, so it can't tell anxious and avoidant patterns apart. Your answers look more ${names} than the label above suggests.`;
const ALL_SECURE = "You picked the secure reaction in every situation.";

async function expectScore(page, plan) {
  const counts = countPlan(plan);
  const score = counts.S;
  const band = bandFor(score);

  await expect(page.locator("#score-num")).toHaveText(String(score));
  await expect(page.getByText(`of ${TOTAL} correct`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: band.label, exact: true })).toBeVisible();
  await expect(page.locator("#style-name")).toHaveText(band.label);
  await expect(page.locator("#style-text")).toHaveText(band.text);

  // Exactly one highlighted row in the result key, and it is the right one.
  const key = page.getByRole("table", { name: "Scoring key with your result highlighted" });
  const rows = key.locator("tbody tr");
  await expect(rows).toHaveCount(BANDS.length);
  await expect(rows.locator("th .range")).toHaveText(BANDS.map((b) => b.range));
  await expect(key.locator("tr.is-you")).toHaveCount(1);
  await expect(key.locator("tr[aria-current]")).toHaveCount(1);
  await expect(key.getByText("Your result", { exact: true })).toHaveCount(1);

  const at = BANDS.indexOf(band);
  for (let i = 0; i < BANDS.length; i++) {
    const row = rows.nth(i);
    if (i === at) {
      await expect(row).toHaveClass(/\bis-you\b/);
      await expect(row).toHaveAttribute("aria-current", "true");
      await expect(row.locator(".range")).toHaveText(band.range);
      await expect(row.locator("td")).toHaveText(`${band.label}Your result`);
      await expect(row.locator(".you-tag")).toHaveText("Your result");
    } else {
      await expect(row).not.toHaveClass(/\bis-you\b/);
      await expect(row).not.toHaveAttribute("aria-current");
      await expect(row.locator("td")).toHaveText(BANDS[i].label);
    }
  }
  // The highlight is visible, not only an attribute.
  const bgs = await rows.locator("th").evaluateAll((ths) => ths.map((th) => getComputedStyle(th).backgroundColor));
  expect(new Set(bgs.filter((_, i) => i !== at)).size).toBe(1);
  expect(bgs[at]).not.toBe(bgs[(at + 1) % BANDS.length]);
}

async function expectBreakdown(page, plan) {
  const counts = countPlan(plan);
  const rows = page.locator("#breakdown .bd-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.locator(".bd-label")).toHaveText(TYPES.map((t) => TYPE_NAMES[t]));
  await expect(rows.locator(".bd-count")).toHaveText(TYPES.map((t) => String(counts[t])));
  for (let i = 0; i < 4; i++) {
    const t = TYPES[i];
    await expect(rows.nth(i)).toHaveAttribute("data-type", t);
    await expect(rows.nth(i)).toHaveAttribute("title", `${TYPE_NAMES[t]}: ${counts[t]} of ${TOTAL} answers`);
  }

  // Bar widths are proportional to count / 15 of the track.
  const expected = TYPES.map((t) => counts[t] / TOTAL);
  await expect
    .poll(
      async () => {
        const ratios = await rows.evaluateAll((els) =>
          els.map((row) => {
            const bar = row.querySelector(".bd-bar").getBoundingClientRect().width;
            const track = row.querySelector(".bd-track").getBoundingClientRect().width;
            return bar / track;
          }),
        );
        return Math.max(...ratios.map((r, i) => Math.abs(r - expected[i])));
      },
      { message: `bar widths should be ${expected.map((e) => e.toFixed(3)).join(", ")} of the track` },
    )
    .toBeLessThan(0.01);
  const zeroBars = await rows.evaluateAll((els) => els.map((row) => row.querySelector(".bd-bar").getBoundingClientRect().width));
  TYPES.forEach((t, i) => {
    if (counts[t] === 0) expect(zeroBars[i], `${t} bar is empty`).toBe(0);
    else expect(zeroBars[i], `${t} bar is drawn`).toBeGreaterThan(0);
  });
}

// One plan per band boundary; together they also cover every kind of lean note.
const BOUNDARIES = [
  {
    plan: makePlan({ S: 0, A: 5, V: 5, F: 5 }),
    lean: "Your 15 non-secure answers: 5 anxious, 5 avoidant, 5 fearful. They're split evenly between anxious, avoidant and fearful.",
  },
  {
    plan: makePlan({ S: 3, A: 10, V: 1, F: 1 }),
    lean: `Your 12 non-secure answers: 10 anxious, 1 avoidant, 1 fearful. They lean anxious, which looks like ${DESC.A}.`,
  },
  {
    plan: makePlan({ S: 4, A: 1, V: 2, F: 8 }),
    lean: `Your 11 non-secure answers: 1 anxious, 2 avoidant, 8 fearful. They lean fearful, which looks like ${DESC.F}.`,
  },
  {
    plan: makePlan({ S: 7, A: 5, V: 2, F: 1 }),
    lean: `Your 8 non-secure answers: 5 anxious, 2 avoidant, 1 fearful. They lean anxious, which looks like ${DESC.A}.${MISMATCH("anxious")}`,
  },
  {
    plan: makePlan({ S: 8, A: 1, V: 3, F: 3 }),
    lean: `Your 7 non-secure answers: 1 anxious, 3 avoidant, 3 fearful. They're split evenly between avoidant and fearful.${MISMATCH("avoidant and fearful")}`,
  },
  {
    plan: makePlan({ S: 10, A: 1, V: 3, F: 1 }),
    lean: `Your 5 non-secure answers: 1 anxious, 3 avoidant, 1 fearful. They lean avoidant, which looks like ${DESC.V}.${MISMATCH("avoidant")}`,
  },
  {
    plan: makePlan({ S: 11, A: 2, V: 2, F: 0 }),
    lean: "Your 4 non-secure answers: 2 anxious, 2 avoidant, 0 fearful. They're split evenly between anxious and avoidant.",
  },
  {
    plan: makePlan({ S: 13, A: 0, V: 0, F: 2 }),
    lean: `Your 2 non-secure answers: 0 anxious, 0 avoidant, 2 fearful. They lean fearful, which looks like ${DESC.F}.`,
  },
  {
    plan: makePlan({ S: 14, A: 0, V: 1, F: 0 }),
    lean: `Your one non-secure answer was avoidant, which looks like ${DESC.V}.`,
  },
  {
    plan: makePlan({ S: 15 }),
    lean: ALL_SECURE,
  },
];

test.describe("scoring at every band boundary", () => {
  for (const { plan, lean } of BOUNDARIES) {
    const score = countPlan(plan).S;
    test(`${score} secure answers -> ${bandFor(score).label} (${plan})`, async ({ page }) => {
      await completeQuiz(page, plan);
      await expectScore(page, plan);
      await expectBreakdown(page, plan);
      await expect(page.locator("#lean")).toHaveText(lean);
    });
  }
});

test.describe("lean note", () => {
  test("all secure answers get the all-secure note", async ({ page }) => {
    const plan = "S".repeat(TOTAL);
    await completeQuiz(page, plan);
    await expect(page.locator("#lean")).toHaveText(ALL_SECURE);
    await expect(page.locator("#lean")).not.toContainText("non-secure");
  });

  test("exactly one miss names that single answer type", async ({ page }) => {
    const plan = "SSSSSSSFSSSSSSS";
    await completeQuiz(page, plan);
    await expectScore(page, plan);
    await expect(page.locator("#lean")).toHaveText(`Your one non-secure answer was fearful, which looks like ${DESC.F}.`);
  });

  test("an anxious band with avoidant-leaning answers says they look more avoidant", async ({ page }) => {
    const plan = makePlan({ S: 2, A: 1, V: 10, F: 2 });
    await completeQuiz(page, plan);
    await expect(page.locator("#style-name")).toHaveText("Anxious-preoccupied");
    const note = page.locator("#lean");
    await expect(note).toContainText("look more avoidant");
    await expect(note).toHaveText(
      `Your 13 non-secure answers: 1 anxious, 10 avoidant, 2 fearful. They lean avoidant, which looks like ${DESC.V}.${MISMATCH("avoidant")}`,
    );
  });

  test("a tie between non-secure types says they are split evenly", async ({ page }) => {
    const plan = makePlan({ S: 13, A: 1, V: 0, F: 1 });
    await completeQuiz(page, plan);
    await expect(page.locator("#style-name")).toHaveText("Mostly secure");
    const note = page.locator("#lean");
    await expect(note).toContainText("split evenly between");
    await expect(note).toHaveText("Your 2 non-secure answers: 1 anxious, 0 avoidant, 1 fearful. They're split evenly between anxious and fearful.");
    await expect(note).not.toContainText("look more");
  });

  test("when the lean matches the band there is no mismatch sentence", async ({ page }) => {
    const plan = makePlan({ S: 5, A: 2, V: 2, F: 6 });
    await completeQuiz(page, plan);
    await expect(page.locator("#style-name")).toHaveText("Fearful-avoidant");
    const note = page.locator("#lean");
    await expect(note).toHaveText(`Your 10 non-secure answers: 2 anxious, 2 avoidant, 6 fearful. They lean fearful, which looks like ${DESC.F}.`);
    await expect(note).not.toContainText("The score only counts secure answers");
    await expect(note).not.toContainText("look more");
  });
});

test.describe("review list", () => {
  test("lists all 15 answers, labels each pick and shows the secure answer only for misses", async ({ page }) => {
    const plan = "SSVSSASVSSVSASV";
    const shown = await completeQuiz(page, plan);

    const review = page.locator("#review");
    const items = page.locator("#review-list > li");
    // Collapsed until the summary is opened.
    await expect(review).not.toHaveAttribute("open");
    await expect(items.first()).toBeHidden();
    await page.getByText("Review your answers", { exact: true }).click();
    await expect(review).toHaveAttribute("open");
    await expect(items).toHaveCount(TOTAL);
    await expect(items.first()).toBeVisible();

    for (let k = 0; k < TOTAL; k++) {
      const item = items.nth(k);
      const { choice, scenario, texts } = shown[k];
      await expect(item.locator(".r-q")).toHaveText(`Q${k + 1}${scenario}`);

      const picks = item.locator(".r-pick");
      const tags = item.locator(".r-tag");
      await expect(tags.first()).toHaveText(`Your answer · ${TYPE_NAMES[choice]}`);
      await expect(tags.first()).toHaveAttribute("data-type", choice);
      await expect(picks.first().locator(".r-text")).toHaveText(texts[choice]);

      if (choice === "S") {
        await expect(picks).toHaveCount(1);
        await expect(item.getByText("Secure answer", { exact: true })).toHaveCount(0);
      } else {
        await expect(picks).toHaveCount(2);
        await expect(tags.nth(1)).toHaveText("Secure answer");
        await expect(tags.nth(1)).toHaveAttribute("data-type", "S");
        await expect(picks.nth(1).locator(".r-text")).toHaveText(texts.S);
      }
    }
    const misses = [...plan].filter((c) => c !== "S").length;
    await expect(page.locator("#review-list").getByText("Secure answer", { exact: true })).toHaveCount(misses);
  });
});
