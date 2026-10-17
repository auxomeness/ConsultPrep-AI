import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProductIntroduction from "../../components/patient/ProductIntroduction";

describe("ProductIntroduction", () => {
  it("presents one clear path into the intake demo and its essential limits", () => {
    render(<ProductIntroduction />);

    const main = screen.getByRole("main");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ConsultPrep AI");
    expect(screen.getByText("AI documents. Clinicians decide.")).toBeTruthy();
    expect(screen.getByText(/organize what you want to share before a healthcare consultation/i)).toBeTruthy();
    expect(screen.getByText(/does not diagnose, prescribe, or replace professional medical judgment/i)).toBeTruthy();

    const entry = within(main).getByRole("link", { name: "Begin intake" });
    expect(entry.getAttribute("href")).toBe("/intake");
    expect(within(main).getAllByRole("link")).toHaveLength(1);
    expect(within(main).queryByRole("textbox")).toBeNull();
    expect(within(main).getByText(/Demo only\. Use made-up information; no patient record is created/i)).toBeTruthy();
  });
});
