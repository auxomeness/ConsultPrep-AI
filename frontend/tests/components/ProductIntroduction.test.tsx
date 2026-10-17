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
    expect(screen.getByText(/Synthetic demo only.*Nothing is saved to a patient record/i)).toBeTruthy();
    expect(screen.getByText(/Your submitted answers are sent to AMD for a response/i)).toBeTruthy();
  });
});
