import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProductIntroduction from "../../components/patient/ProductIntroduction";

describe("ProductIntroduction", () => {
  it("explains the product, clinical limits, and AMD AI demo", () => {
    render(<ProductIntroduction />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ConsultPrep AI");
    expect(screen.getByText("AI documents. Clinicians decide.")).toBeTruthy();
    expect(screen.getByText(/does not diagnose, prescribe, or replace professional medical judgment/i)).toBeTruthy();

    const preview = screen.getByRole("link", { name: "Try the AMD AI intake" });
    expect(preview.getAttribute("href")).toBe("/intake");
    const introduction = screen.getByRole("region", { name: /organize your concerns/i });
    const demoNotice = within(introduction).getByText(/Nothing is saved to a patient record or sent to a clinician/i);
    expect(demoNotice.textContent).toMatch(/Development demo/i);
    expect(screen.getByText(/Your submitted answers are sent to AMD AI for a response/i)).toBeTruthy();
  });
});
