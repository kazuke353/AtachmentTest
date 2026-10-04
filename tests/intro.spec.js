import { test, expect } from "./support/fixtures.js";
import { BANDS, TOTAL, counter, openPage, restartButton, screen, startButton } from "./support/quiz.js";

test.describe("intro screen", () => {
  test("shows the heading, the five-row scoring key and the start button", async ({ page }) => {
    await openPage(page);

    await expect(page).toHaveTitle("The Attachment Style Test");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Attachment Style Test");
    await expect(screen(page, "intro").getByText("15 situations · about 4 minutes")).toBeVisible();

    const key = page.getByRole("table", { name: "Scoring key", exact: true });
    await expect(key).toBeVisible();
    const rows = key.locator("tbody tr");
    await expect(rows).toHaveCount(BANDS.length);
    await expect(rows.locator("th .range")).toHaveText(BANDS.map((b) => b.range));
    await expect(rows.locator("th .unit")).toHaveText(BANDS.map(() => "Correct"));
    await expect(rows.locator("td")).toHaveText(BANDS.map((b) => b.label));
    for (let i = 0; i < BANDS.length; i++) {
      await expect(rows.nth(i).getByRole("rowheader")).toHaveText(`${BANDS[i].range}Correct`);
    }

    // Nothing is highlighted before the test is taken.
    await expect(key.locator("tr.is-you")).toHaveCount(0);
    await expect(key.locator("[aria-current]")).toHaveCount(0);
    await expect(key.getByText("Your result")).toHaveCount(0);

    const start = page.getByRole("button", { name: "Take the test" });
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled();
    await expect(restartButton(page)).toBeHidden();

    await expect(screen(page, "quiz")).toBeHidden();
    await expect(screen(page, "result")).toBeHidden();
  });

  test("the start button opens question 1", async ({ page }) => {
    await openPage(page);
    await startButton(page).click();
    await expect(screen(page, "intro")).toBeHidden();
    await expect(screen(page, "quiz")).toBeVisible();
    await expect(counter(page)).toHaveText(`Question 1 of ${TOTAL}`);
    await expect(page.locator("#scenario")).toBeFocused();
  });
});
