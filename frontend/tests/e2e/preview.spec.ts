import { expect, test } from "@playwright/test";

test("introduction navigates to the intake demo and back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText("AI documents. Clinicians decide.")).toBeVisible();
  await expect(page.getByText(/does not diagnose, prescribe, or replace professional medical judgment/i)).toBeVisible();
  await page.getByRole("link", { name: "Begin intake" }).click();

  await expect(page).toHaveURL(/\/intake$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prepare for a clinician visit");
  await expect(page.getByRole("note")).toBeVisible();
  await expect(page.getByRole("note")).toContainText(/development demo/i);
  await expect(page.getByRole("note")).toContainText(/no patient record or clinician handoff is created/i);

  await page.getByRole("link", { name: "ConsultPrep AI, introduction" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("empty and whitespace-only concerns cannot be sent, while text remains editable", async ({ page }) => {
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
  await expect(page.getByRole("status")).toHaveCount(0);
  await field.fill("Synthetic concern");
  await expect(send).toBeEnabled();
  await field.focus();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Synthetic concern");
  expect(nonGetRequests).toEqual([]);
});

test("synthetic API responses render the question, original answer, and follow-up", async ({ page }) => {
  const operations: string[] = [];
  const originalAnswer = "  Synthetic stomach discomfort  ";
  let sentAnswer: string | undefined;
  let releaseTurn: (() => void) | undefined;
  const turnGate = new Promise<void>((resolve) => { releaseTurn = resolve; });
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
      sentAnswer = request.text;
      await turnGate;
      await route.fulfill({ json: { state: { ...startState, concern: request.text }, assistantMessage: "When did it begin?", safety: false } });
    } else {
      await route.abort();
    }
  });

  await page.goto("/intake");
  const field = page.getByRole("textbox", { name: "Your answer" });
  await field.fill(originalAnswer);
  await field.press("Enter");

  await expect(page.getByRole("article", { name: "ConsultPrep" }).first()).toContainText("What have you been feeling?");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
  expect(sentAnswer).toBe(originalAnswer);
  releaseTurn?.();
  expect(await page.getByRole("article", { name: "Your response" }).evaluate((element) => element.textContent)).toContain(originalAnswer);
  await expect(page.getByRole("article", { name: "ConsultPrep" }).last()).toContainText("When did it begin?");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(operations).toEqual(["start", "turn"]);
  await field.fill("Another synthetic detail");
  await expect(field).toHaveValue("Another synthetic detail");
  await expect(page.getByText(/^Saved$|^Submitted$/)).toHaveCount(0);
});

test("a failed AI turn keeps the exact synthetic answer editable", async ({ page }) => {
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
    const operation = (route.request().postDataJSON() as { operation: string }).operation;
    if (operation === "start") {
      await route.fulfill({ json: { state: startState, assistantMessage: "What have you been feeling?" } });
    } else {
      await route.fulfill({ status: 503, json: { error: { message: "The AI service is unavailable. Please try again." } } });
    }
  });

  await page.goto("/intake");
  const originalAnswer = "  Synthetic answer retained after failure  ";
  const field = page.getByRole("textbox", { name: "Your answer" });
  await field.fill(originalAnswer);
  await field.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "The AI service is unavailable" })).toBeVisible();
  await expect(field).toHaveValue(originalAnswer);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText(/^Saved$|^Submitted$/)).toHaveCount(0);
});

test("mocked summary confirmation remains distinct from submission", async ({ page }) => {
  const state = {
    schemaVersion: "1.0",
    concern: "Synthetic concern",
    responses: [],
    fields: [],
    questionsAsked: ["What have you been feeling?"],
    activeQuestionId: "main_concern",
    completion: "in_progress",
  };
  const brief = {
    status: "ai_generated_draft",
    reasonForConsultation: [{ text: "Synthetic concern", sourceResponseIds: ["response-1"], originalText: ["Synthetic concern"] }],
    currentSymptoms: [],
    symptomTimeline: [],
    relevantBackground: [],
    importantUnansweredQuestions: [],
    sourceTraceability: [{ responseId: "response-1", originalText: "Synthetic concern" }],
  };
  await page.route("**/api/demo/intake", async (route) => {
    const operation = (route.request().postDataJSON() as { operation: string }).operation;
    if (operation === "start") {
      await route.fulfill({ json: { state, assistantMessage: "What have you been feeling?" } });
    } else if (operation === "turn") {
      await route.fulfill({ json: { state, assistantMessage: "Is there anything else?", safety: false } });
    } else if (operation === "brief") {
      await route.fulfill({ json: { brief } });
    } else {
      await route.fulfill({ json: { state, brief: { ...brief, status: "patient_confirmed" } } });
    }
  });

  await page.goto("/intake");
  await page.getByRole("textbox", { name: "Your answer" }).fill("Synthetic concern");
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByText("Is there anything else?")).toBeVisible();
  await page.getByRole("button", { name: "Review summary" }).click();
  await expect(page.getByText("AI-generated draft · Review before confirming")).toBeVisible();
  await page.getByRole("button", { name: "This summary is accurate" }).click();
  await expect(page.getByText("Confirmed · Not submitted")).toBeVisible();
  await expect(page.getByText(/^Submitted$|^Finalized$/)).toHaveCount(0);
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
    const entry = page.getByRole("link", { name: "Begin intake" });
    await expect(entry).toBeVisible();
    expect(await entry.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await entry.focus();
    await expect(entry).toBeFocused();
    expect(await entry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await entry.click();
    const field = page.getByRole("textbox", { name: "Your answer" });
    const send = page.getByRole("button", { name: "Send answer" });
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
