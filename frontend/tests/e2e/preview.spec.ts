import { expect, test } from "@playwright/test";

test("introduction navigates to the clearly labeled intake preview and back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText("AI documents. Clinicians decide.")).toBeVisible();
  await page.getByRole("link", { name: "Preview patient intake" }).click();

  await expect(page).toHaveURL(/\/intake$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Describe your main concern");
  await expect(page.getByText(/Frontend development preview/)).toBeVisible();
  await expect(page.getByText(/No session is created, and nothing you type is saved or sent/)).toBeVisible();
  await expect(page.getByText(/AI follow-up questions, review, and submission are unavailable/)).toBeVisible();

  await page.getByRole("link", { name: "Back to introduction" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("local concern validation preserves text, focus, and truthful feedback", async ({ page }) => {
  await page.goto("/intake");
  const field = page.getByRole("textbox", { name: "Your initial concern" });
  const check = page.getByRole("button", { name: "Check response locally" });
  const nonGetRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") nonGetRequests.push(`${request.method()} ${request.url()}`);
  });

  await check.click();
  const error = page.getByRole("alert").filter({ hasText: /enter a concern/i });
  await expect(error).toContainText(/enter a concern/i);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  const errorId = await error.getAttribute("id");
  expect((await field.getAttribute("aria-describedby"))?.split(" ")).toContain(errorId);

  await field.fill("   ");
  await check.click();
  await expect(field).toHaveValue("   ");
  await expect(error).toBeVisible();
  await expect(field).toBeFocused();

  await field.fill("I would like to discuss a made-up concern.");
  await field.press("End");
  await field.pressSequentially(" More detail.");
  await check.press("Enter");
  await expect(field).toHaveValue("I would like to discuss a made-up concern. More detail.");
  await expect(page.getByRole("status")).toContainText(/Local check complete.*not been saved or sent/i);
  await expect(error).toHaveCount(0);
  await expect(page.getByText(/^Saved$|^Submitted$|AI has processed/i)).toHaveCount(0);
  expect(nonGetRequests).toEqual([]);
  await expect(page).toHaveURL(/\/intake$/);
});

test.describe("before client hydration", () => {
  test.use({ javaScriptEnabled: false });

  test("the local-check button cannot submit concern text in the URL", async ({ page }) => {
    await page.goto("/intake");
    const field = page.getByRole("textbox", { name: "Your initial concern" });
    await field.fill("A synthetic concern");
    await page.getByRole("button", { name: "Check response locally" }).click();

    await expect(page).toHaveURL(/\/intake$/);
    await expect(field).toHaveValue("A synthetic concern");
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});

for (const width of [375, 768, 1280]) {
  test(`introduction and intake remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/");
    const preview = page.getByRole("link", { name: "Preview patient intake" });
    await expect(preview).toBeVisible();
    // Regression: the old Webpack build omitted Tailwind utility CSS.
    expect(await preview.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await preview.click();
    const field = page.getByRole("textbox", { name: "Your initial concern" });
    const check = page.getByRole("button", { name: "Check response locally" });
    await expect(field).toBeVisible();
    await expect(check).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await field.focus();
    const focusStyle = await field.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(focusStyle).not.toBe("none");
  });
}
