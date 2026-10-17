import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PatientReview from "../../components/patient/PatientReview";
import { reviewFixture } from "../../lib/review-fixture";

describe("PatientReview contract-shaped fixture presentation", () => {
  it("keeps original wording and a later correction separate from synthetic draft text", () => {
    render(<PatientReview state={{ kind: "ready", data: reviewFixture }} />);
    const statements = screen.getByRole("region", { name: "Patient statements" });
    expect(within(statements).getByText("I have a headache near my forehead.")).toBeTruthy();
    expect(within(statements).getByText("Correction: the headache is near my temples.")).toBeTruthy();
    expect(within(statements).getByText(/Corrects response r1/)).toBeTruthy();
    const brief = screen.getByRole("region", { name: "Consultation brief" });
    expect(within(brief).getByText("Headache near the temples")).toBeTruthy();
    expect(within(brief).getAllByText(/Synthetic draft wording/).length).toBeGreaterThan(0);
    expect(within(brief).getByText(/No AI generated this example/)).toBeTruthy();
  });

  it("opens the correct source and keeps the source action focused", async () => {
    const user = userEvent.setup();
    render(<PatientReview state={{ kind: "ready", data: reviewFixture }} />);
    const brief = screen.getByRole("region", { name: "Consultation brief" });
    const mainConcern = within(brief).getByRole("region", { name: "Main concern" });
    const source = within(mainConcern).getByText("View original patient statement r6");
    source.focus();
    expect(document.activeElement).toBe(source);
    await user.click(source);
    expect(within(mainConcern).getByText("Correction: the headache is near my temples.")).toBeTruthy();
    expect(source.closest("details")?.open).toBe(true);
    await user.click(source);
    expect(source.closest("details")?.open).toBe(false);
    expect(document.activeElement).toBe(source);
  });

  it("shows every conflicting source without selecting a winner", async () => {
    const user = userEvent.setup();
    render(<PatientReview state={{ kind: "ready", data: reviewFixture }} />);
    const states = screen.getByRole("region", { name: "Current information states" });
    const conflict = within(states).getByText("onset · Conflicting").closest("li")!;
    expect(conflict.textContent).toMatch(/no version has been selected/i);
    await user.click(within(conflict).getByText("View original patient statement r4"));
    await user.click(within(conflict).getByText("View original patient statement r5"));
    expect(within(conflict).getByText("I first noticed it Monday.")).toBeTruthy();
    expect(within(conflict).getByText("I first noticed it Wednesday.")).toBeTruthy();
  });

  it("keeps unknown, not answered, and unclear distinct", async () => {
    const user = userEvent.setup();
    render(<PatientReview state={{ kind: "ready", data: reviewFixture }} />);
    const states = screen.getByRole("region", { name: "Current information states" });
    const unknown = within(states).getByText("usual duration · Unknown").closest("li")!;
    expect(unknown.textContent).toMatch(/not a denial/i);
    await user.click(within(unknown).getByText("View original patient statement r2"));
    expect(within(unknown).getByText("I don't know how long it usually lasts.")).toBeTruthy();
    const unanswered = within(states).getByText("previous episodes · Not answered").closest("li")!;
    expect(unanswered.textContent).toMatch(/no answer was recorded/i);
    expect(unanswered.querySelector("blockquote")).toBeNull();
    const unclear = within(states).getByText("frequency · Unclear").closest("li")!;
    await user.click(within(unclear).getByText("View original patient statement r3"));
    expect(within(unclear).getByText("Sometimes.")).toBeTruthy();
  });

  it("names missing and mismatched sources instead of showing a false source action", () => {
    const missing = structuredClone(reviewFixture);
    missing.brief.primaryConcern[0].sourceResponseIds = ["missing-id"];
    render(<PatientReview state={{ kind: "ready", data: missing }} />);
    const mainConcern = screen.getByRole("region", { name: "Main concern" });
    expect(within(mainConcern).getByText(/Missing or mismatched source missing-id/)).toBeTruthy();
    expect(within(mainConcern).queryByText("View original patient statement missing-id")).toBeNull();
  });

  it("rejects a source whose trace text differs from the original response", () => {
    const mismatch = structuredClone(reviewFixture);
    mismatch.brief.sourceTraceability[5].originalText = "Different statement";
    render(<PatientReview state={{ kind: "ready", data: mismatch }} />);
    const mainConcern = screen.getByRole("region", { name: "Main concern" });
    expect(within(mainConcern).getByText(/this entry is unsupported/)).toBeTruthy();
  });

  it("offers no fake save or confirmation success", () => {
    render(<PatientReview state={{ kind: "ready", data: reviewFixture }} />);
    expect(screen.getByRole("button", { name: /Correct information/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Confirm/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Corrections cannot be saved from this preview/)).toBeTruthy();
    expect(screen.queryByText(/^Saved$|^Submitted$/)).toBeNull();
  });

  it("has explicit absent, invalid, and unavailable review messages", () => {
    const { rerender } = render(<PatientReview state={{ kind: "missing", message: "No brief was generated." }} />);
    expect(screen.getByRole("heading", { name: "No consultation brief is available" })).toBeTruthy();
    rerender(<PatientReview state={{ kind: "invalid", message: "Brief validation failed." }} />);
    expect(screen.getByText("Brief validation failed.")).toBeTruthy();
    rerender(<PatientReview state={{ kind: "unavailable", message: "Retrieval failed." }} />);
    expect(screen.getByText("Retrieval failed.")).toBeTruthy();
  });
});
