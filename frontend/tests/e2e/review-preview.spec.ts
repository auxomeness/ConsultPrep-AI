import { expect, test } from "@playwright/test";

test("synthetic review is distinct from the local intake draft and sources work by keyboard", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${request.url()}`);
  });
<<<<<<< Updated upstream
  await page.goto("/intake/review");
=======
  await page.goto("/intake");
  const openReview = page.getByRole("link", { name: "View synthetic patient review" });
  await expect(page.getByText(/your local drafts are not carried there/i)).toBeVisible();
  await openReview.focus();
  await openReview.press("Enter");

>>>>>>> Stashed changes
  await expect(page).toHaveURL(/\/intake\/review$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Review the example brief");
  await expect(page.getByText(/No AI generated it, no patient record was retrieved/)).toBeVisible();
  const mainConcern = page.getByRole("region", { name: "Main concern" });
  const source = mainConcern.locator("summary", { hasText: "View original patient statement r6" });
  await source.focus();
  await expect(source).toBeFocused();
  expect(await source.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await source.press("Enter");
  await expect(mainConcern.getByText("Correction: the headache is near my temples.")).toBeVisible();
  await source.press("Enter");
  await expect(source).toBeFocused();
  await expect(mainConcern.getByText("Correction: the headache is near my temples.")).toBeHidden();
  await expect(page.getByRole("button", { name: /Correct information/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Confirm/ })).toBeDisabled();
  expect(writes).toEqual([]);
});

for (const width of [375, 768, 1280]) {
  test(`review preview remains readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/intake/review");
    await expect(page.getByRole("region", { name: "Patient statements" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Current information states" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Consultation brief" })).toBeVisible();
    const conflict = page.getByRole("region", { name: "Current information states" }).getByText("onset · Conflicting").locator("..");
    await conflict.getByText("View original patient statement r4").click();
    await conflict.getByText("View original patient statement r5").click();
    await expect(conflict.getByText("I first noticed it Monday.")).toBeVisible();
    await expect(conflict.getByText("I first noticed it Wednesday.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
