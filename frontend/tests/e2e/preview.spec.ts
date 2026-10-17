import { expect, test } from "@playwright/test";

test("introduction navigates to the AMD AI demo and back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText("AI documents. Clinicians decide.")).toBeVisible();
<<<<<<< Updated upstream
  await expect(page.getByText(/submitted answers are sent to AMD AI for a response/i)).toBeVisible();
  await page.getByRole("link", { name: "Try the AMD AI intake" }).click();

  await expect(page).toHaveURL(/\/intake$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prepare for a clinician visit");
  await expect(page.getByRole("note")).toContainText(/development demo/i);
  await expect(page.getByRole("note")).toContainText(/not saved to a patient record or sent to a clinician/i);
=======
  await page.getByRole("link", { name: /Begin intake preview/ }).click();

  await expect(page).toHaveURL(/\/intake$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Let's start with your concern");
  await expect(page.getByText(/Frontend development preview/)).toBeVisible();
  await expect(page.getByText(/No patient session is created/)).toBeVisible();
  await expect(page.getByText(/Nothing is saved, submitted, or sent to AI or a clinician/)).toBeVisible();
>>>>>>> Stashed changes

  await page.getByRole("link", { name: "ConsultPrep AI, introduction" }).click();
  await expect(page).toHaveURL(/\/$/);
});

<<<<<<< Updated upstream
test("empty and whitespace-only concerns cannot be sent, while text remains editable", async ({ page }) => {
=======
test("landing concern is carried once into the local preview without a server write", async ({ page }) => {
  const nonGetRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") nonGetRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/");
  const landingConcern = page.getByRole("textbox", { name: "What would you like to discuss?" });
  const descriptionId = await landingConcern.getAttribute("aria-describedby");
  expect(descriptionId).toBeTruthy();
  await expect(page.locator(`#${descriptionId}`)).toContainText("Use made-up information");
  const exactText = "  A made-up concern for the preview.  ";
  await landingConcern.fill(exactText);
  await page.getByRole("link", { name: /Begin intake preview/ }).click();
  const intakeConcern = page.getByRole("textbox", { name: "Your initial concern" });
  await expect(intakeConcern).toHaveValue(exactText);
  await expect(page.getByRole("article", { name: "Synthetic preview question" })).toHaveCount(0);
  expect(nonGetRequests).toEqual([]);
  await page.reload();
  await expect(intakeConcern).toHaveValue("");
});

test("the new palette keeps essential text contrast and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const preview = page.getByRole("link", { name: /Begin intake preview/ });
  const result = await preview.evaluate((element) => {
    const styles = getComputedStyle(document.documentElement);
    const rgb = (token: string) => {
      const raw = styles.getPropertyValue(token).trim().replace("#", "");
      const hex = raw.length === 3 ? [...raw].map((character) => character + character).join("") : raw;
      return [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    };
    const luminance = (channels: number[]) => channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (front: string, back: string) => {
      const first = luminance(rgb(front));
      const second = luminance(rgb(back));
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const duration = getComputedStyle(element).transitionDuration.split(",")[0].trim();
    const durationMs = duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    return {
      main: ratio("--foreground", "--background"),
      muted: ratio("--muted", "--background"),
      action: ratio("--accent-contrast", "--accent"),
      notice: ratio("--preview-foreground", "--preview"),
      durationMs,
    };
  });
  expect(result.main).toBeGreaterThanOrEqual(4.5);
  expect(result.muted).toBeGreaterThanOrEqual(4.5);
  expect(result.action).toBeGreaterThanOrEqual(4.5);
  expect(result.notice).toBeGreaterThanOrEqual(4.5);
  expect(result.durationMs).toBeLessThanOrEqual(0.01);
});

test("local concern validation preserves text, focus, and truthful feedback", async ({ page }) => {
>>>>>>> Stashed changes
  await page.goto("/intake");
  const field = page.getByRole("textbox", { name: "Your answer" });
  const send = page.getByRole("button", { name: "Send answer" });
  const nonGetRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") nonGetRequests.push(`${request.method()} ${request.url()}`);
  });

  await expect(send).toBeDisabled();
  await field.fill("   ");
  await expect(field).toHaveValue("   ");
  await expect(send).toBeDisabled();
  await field.fill("Synthetic concern");
  await expect(send).toBeEnabled();
  await field.focus();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Synthetic concern");
  expect(nonGetRequests).toEqual([]);
});

test("synthetic API responses render the question, original answer, and follow-up", async ({ page }) => {
  const operations: string[] = [];
  const startState = {
    schemaVersion: "1.0",
    concern: "",
    responses: [],
    fields: [],
    questionsAsked: ["What have you been feeling?"],
    activeQuestionId: "main_concern",
    completion: "in_progress",
  };
  await page.route("**/api/demo/intake", async (route) => {
    const request = route.request().postDataJSON() as { operation: string; text?: string };
    operations.push(request.operation);
    if (request.operation === "start") {
      await route.fulfill({ json: { state: startState, assistantMessage: "What have you been feeling?" } });
    } else if (request.operation === "turn") {
      await route.fulfill({ json: { state: { ...startState, concern: request.text }, assistantMessage: "When did it begin?", safety: false } });
    } else {
      await route.abort();
    }
  });

  await page.goto("/intake");
  const field = page.getByRole("textbox", { name: "Your answer" });
  await field.fill("Synthetic stomach discomfort");
  await field.press("Enter");

  await expect(page.getByRole("article", { name: "ConsultPrep" }).first()).toContainText("What have you been feeling?");
  await expect(page.getByRole("article", { name: "Your response" })).toContainText("Synthetic stomach discomfort");
  await expect(page.getByRole("article", { name: "ConsultPrep" }).last()).toContainText("When did it begin?");
  expect(operations).toEqual(["start", "turn"]);
  await field.fill("Another synthetic detail");
  await expect(field).toHaveValue("Another synthetic detail");
  await expect(page.getByText(/^Saved$|^Submitted$/)).toHaveCount(0);
});

test.describe("before client hydration", () => {
  test.use({ javaScriptEnabled: false });

  test("the disabled send action cannot put concern text in the URL", async ({ page }) => {
    await page.goto("/intake");
    const field = page.getByRole("textbox", { name: "Your answer" });
    await field.fill("A synthetic concern");
    await expect(page.getByRole("button", { name: "Send answer" })).toBeDisabled();
    await expect(page).toHaveURL(/\/intake$/);
    await expect(field).toHaveValue("A synthetic concern");
  });
});

for (const width of [375, 768, 1280]) {
  test(`introduction and intake remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/");
<<<<<<< Updated upstream
    const entry = page.getByRole("link", { name: "Try the AMD AI intake" });
    await expect(entry).toBeVisible();
    expect(await entry.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await entry.click();
    const field = page.getByRole("textbox", { name: "Your answer" });
    const send = page.getByRole("button", { name: "Send answer" });
=======
    const preview = page.getByRole("link", { name: /Begin intake preview/ });
    await expect(page.getByRole("textbox", { name: "What would you like to discuss?" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await expect(preview).toBeVisible();
    // Regression: the old Webpack build omitted Tailwind utility CSS.
    expect(await preview.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await preview.click();
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Intake preview" })).toHaveAttribute("aria-current", "page");
    const field = page.getByRole("textbox", { name: "Your initial concern" });
    const check = page.getByRole("button", { name: "Check response locally" });
>>>>>>> Stashed changes
    await expect(field).toBeVisible();
    await expect(send).toBeVisible();
    await field.fill("A synthetic concern with a verylongunbrokenwordthatshouldstillwrapwithinthenarrowconversationcolumn.");
    await expect(send).toBeEnabled();
    await field.focus();
    await field.press("Tab");
    await expect(send).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
