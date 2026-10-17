import { expect, test } from "@playwright/test";

const stateLabels = ["Reported", "Unknown", "Not answered", "Unclear", "Conflicting"];

test("the separate synthetic information-state preview is reachable and preserves distinctions", async ({ page }) => {
  await page.goto("/intake/states");
  await expect(page).toHaveURL(/\/intake\/states$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Information states");
  await expect(page.getByText(/Synthetic UI-development preview/)).toBeVisible();
  await expect(page.getByText(/These five answer labels use the current information-status vocabulary/)).toBeVisible();
  for (const label of stateLabels) {
    await expect(page.getByRole("article", { name: label })).toBeVisible();
  }
  const conflicting = page.getByRole("article", { name: "Conflicting" });
  await expect(conflicting.locator("blockquote")).toHaveText(["It started Monday.", "It started Wednesday."]);
  await expect(conflicting).toContainText("Neither is selected as correct.");
  await expect(page.getByRole("article", { name: "Not answered" })).toContainText("No patient response was provided");

  const back = page.getByRole("link", { name: "Back to intake preview" });
  await back.focus();
  await back.press("Enter");
  await expect(page).toHaveURL(/\/intake$/);
});

for (const width of [375, 768, 1280]) {
  test(`information states remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/intake/states");

    const labels = await page.getByRole("article").evaluateAll((articles) =>
      articles.map((article) => article.querySelector("h2")?.textContent),
    );
    expect(labels).toEqual(stateLabels);
    for (const label of stateLabels) {
      await expect(page.getByRole("article", { name: label })).toBeVisible();
    }
    const conflicting = page.getByRole("article", { name: "Conflicting" });
    await expect(conflicting.locator("blockquote")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const reported = page.getByRole("article", { name: "Reported" });
    const contrast = await reported.evaluate((card) => {
      const toRgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (rgb: number[]) => {
        const channels = rgb.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const background = luminance(toRgb(getComputedStyle(card).backgroundColor));
      const foreground = luminance(toRgb(getComputedStyle(card.querySelector("p")!).color));
      return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);

    // Stress the existing wrapping style with a long synthetic statement in the browser DOM.
    await reported.locator("blockquote").evaluate((quote) => {
      quote.textContent = "Verylongsyntheticpatientword".repeat(12);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
