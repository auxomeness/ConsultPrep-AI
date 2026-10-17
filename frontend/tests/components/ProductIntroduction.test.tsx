<<<<<<< Updated upstream
import { render, screen, within } from "@testing-library/react";
=======
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
>>>>>>> Stashed changes
import { describe, expect, it } from "vitest";
import ProductIntroduction from "../../components/patient/ProductIntroduction";

describe("ProductIntroduction", () => {
<<<<<<< Updated upstream
  it("explains the product, clinical limits, and AMD AI demo", () => {
=======
  it("explains the product, clinical limits, and truthful preview action", async () => {
    const user = userEvent.setup();
>>>>>>> Stashed changes
    render(<ProductIntroduction />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ConsultPrep AI");
    expect(screen.getByText("AI documents. Clinicians decide.")).toBeTruthy();
<<<<<<< Updated upstream
    expect(screen.getByText(/does not diagnose, prescribe, or replace professional medical judgment/i)).toBeTruthy();

    const preview = screen.getByRole("link", { name: "Try the AMD AI intake" });
    expect(preview.getAttribute("href")).toBe("/intake");
    const introduction = screen.getByRole("region", { name: /organize your concerns/i });
    const demoNotice = within(introduction).getByText(/Nothing is saved to a patient record or sent to a clinician/i);
    expect(demoNotice.textContent).toMatch(/Development demo/i);
    expect(screen.getByText(/Your submitted answers are sent to AMD AI for a response/i)).toBeTruthy();
=======
    expect(screen.getByText(/does not diagnose, prescribe medication, or replace professional medical judgment/i)).toBeTruthy();

    const field = screen.getByRole("textbox", { name: "What would you like to discuss?" });
    await user.type(field, "A made-up concern to carry into the preview.");
    const preview = screen.getByRole("link", { name: /Begin intake preview/ });
    expect(preview.getAttribute("href")).toBe("/intake");
    expect(screen.getByText(/Use made-up information.*temporary browser-tab draft does not create a patient record/)).toBeTruthy();
    expect(field).toHaveProperty("value", "A made-up concern to carry into the preview.");
>>>>>>> Stashed changes
  });
});
