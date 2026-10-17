import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InformationStatePreview from "../../components/patient/InformationStatePreview";

describe("InformationStatePreview", () => {
  it("shows Reported with the original statement and no medical verification claim", () => {
    render(<InformationStatePreview />);
    const reported = screen.getByRole("article", { name: "Reported" });

    expect(within(reported).getByText("I've had a headache since Monday.").closest("blockquote")).toBeTruthy();
    expect(reported.textContent).toMatch(/not a medically verified finding/i);
    expect(reported.textContent).not.toMatch(/AI-generated|clinician-approved/i);
  });

  it("shows explicit uncertainty as Unknown with patient wording", () => {
    render(<InformationStatePreview />);
    const unknown = screen.getByRole("article", { name: "Unknown" });

    expect(within(unknown).getByText("I don't know.").closest("blockquote")).toBeTruthy();
    expect(unknown.textContent).toMatch(/not a denial or missing response/i);
    expect(within(unknown).queryByText(/^No$/)).toBeNull();
  });

  it("shows Not answered without inventing a patient response", () => {
    render(<InformationStatePreview />);
    const unanswered = screen.getByRole("article", { name: "Not answered" });

    expect(within(unanswered).getByText("Has this happened before?")).toBeTruthy();
    expect(within(unanswered).getByText("No patient response was provided for this question.")).toBeTruthy();
    expect(unanswered.querySelector("blockquote")).toBeNull();
    expect(unanswered.textContent).toMatch(/differs from Unknown and does not mean No/i);
  });

  it("keeps ambiguous wording visible under Unclear", () => {
    render(<InformationStatePreview />);
    const unclear = screen.getByRole("article", { name: "Unclear" });

    expect(within(unclear).getByText("Sometimes.").closest("blockquote")).toBeTruthy();
    expect(unclear.textContent).toMatch(/needs clarification/i);
    expect(unclear.textContent).toMatch(/no more specific interpretation is chosen/i);
  });

  it("shows both unresolved Conflicting statements in order and with equal presentation", () => {
    render(<InformationStatePreview />);
    const conflicting = screen.getByRole("article", { name: "Conflicting" });
    const statements = conflicting.querySelectorAll("blockquote");

    expect(Array.from(statements, (statement) => statement.textContent)).toEqual([
      "It started Monday.",
      "It started Wednesday.",
    ]);
    expect(statements[0].className).toBe(statements[1].className);
    expect(conflicting.textContent).toMatch(/conflict is unresolved/i);
    expect(conflicting.textContent).toMatch(/Neither is selected as correct/i);
  });
});
