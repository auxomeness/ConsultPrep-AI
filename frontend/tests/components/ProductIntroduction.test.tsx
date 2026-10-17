import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProductIntroduction from "../../components/patient/ProductIntroduction";

describe("ProductIntroduction", () => {
  it("explains the product, clinical limits, and AMD AI demo", () => {
    render(<ProductIntroduction />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/organize your concerns/i);
    expect(screen.getByText(/ConsultPrep AI helps/i)).toBeTruthy();
    expect(screen.getByText("AI documents. Clinicians decide.")).toBeTruthy();
    expect(screen.getByText(/does not diagnose, prescribe, or replace professional medical judgment/i)).toBeTruthy();

    const preview = screen.getByRole("link", { name: "Try the AMD AI intake" });
    expect(preview.getAttribute("href")).toBe("/intake");
    expect(screen.getByText(/Development demo.*Nothing is saved to a patient record or sent to a clinician/i)).toBeTruthy();
    expect(screen.getByText(/Talk through your concerns with AMD AI and review a source-linked draft summary/i)).toBeTruthy();
  });
});
