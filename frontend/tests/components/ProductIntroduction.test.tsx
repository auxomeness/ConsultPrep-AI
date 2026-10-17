import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProductIntroduction from "../../components/patient/ProductIntroduction";

describe("ProductIntroduction", () => {
  it("explains the product, clinical limits, and preview action", () => {
    render(<ProductIntroduction />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/organize your concerns/i);
    expect(screen.getByText(/ConsultPrep AI helps/i)).toBeTruthy();
    expect(screen.getByText("AI documents. Clinicians decide.")).toBeTruthy();
    expect(screen.getByText(/does not diagnose conditions, prescribe medication/i)).toBeTruthy();

    const preview = screen.getByRole("link", { name: "Preview patient intake" });
    expect(preview.getAttribute("href")).toBe("/intake");
    expect(screen.getByText(/Frontend preview only.*No patient record is created/i)).toBeTruthy();
  });
});
