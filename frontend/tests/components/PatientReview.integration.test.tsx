import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildStructuredBrief } from "../../../packages/ai/src/brief";
import type { IntakeState } from "../../../packages/ai/src/contracts";
import PatientReview from "../../components/patient/PatientReview";

describe("Member 1 brief builder to patient review presentation", () => {
  it("shows the exact source of a generated brief entry without claiming a live session", () => {
    const state: IntakeState = {
      schemaVersion: "1.0",
      concern: "I have a headache near my forehead.",
      responses: [{ id: "source-1", sequence: 0, text: "I have a headache near my forehead." }],
      fields: [{ fieldId: "primary_concern", value: "Headache near forehead", status: "reported", sourceResponseIds: ["source-1"] }],
      questionsAsked: [],
      completion: "in_progress",
    };
    const brief = buildStructuredBrief(state);
    expect(brief.sourceTraceability).toEqual([{ responseId: "source-1", originalText: state.responses[0].text }]);

    render(<PatientReview state={{ kind: "ready", data: {
      origin: "synthetic_fixture",
      brief,
      responses: state.responses,
      fields: state.fields,
    } }} />);

    const mainConcern = screen.getByRole("region", { name: "Main concern" });
    expect(within(mainConcern).getByText("Headache near forehead")).toBeTruthy();
    expect(within(mainConcern).getByText("View original patient statement source-1")).toBeTruthy();
    expect(screen.getByText(/No AI generated this example/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirm/ }).hasAttribute("disabled")).toBe(true);
  });
});
