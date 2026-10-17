import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ResponseComposer from "../../components/patient/ResponseComposer";

describe("ResponseComposer", () => {
  it("provides a labeled, instructed, editable multiline field", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResponseComposer />);
    const field = screen.getByRole("textbox", { name: "Your initial concern" }) as HTMLTextAreaElement;
    const instructionsId = field.getAttribute("aria-describedby");

    expect(field.tagName).toBe("TEXTAREA");
    expect(instructionsId).toBeTruthy();
    expect(document.getElementById(instructionsId!)?.textContent).toMatch(/made-up information/i);

    await user.type(field, "A synthetic concern");
    expect(field.value).toBe("A synthetic concern");
    rerender(<ResponseComposer />);
    expect(field.value).toBe("A synthetic concern");
    await user.type(field, " to discuss");
    expect(field.value).toBe("A synthetic concern to discuss");
  });

  it("rejects an empty concern with an associated error and field focus", async () => {
    const user = userEvent.setup();
    render(<ResponseComposer />);
    const field = screen.getByRole("textbox", { name: "Your initial concern" });
    const check = screen.getByRole("button", { name: "Check response locally" });

    // A button without native form submission prevents a pre-hydration URL request.
    expect(check.getAttribute("type")).toBe("button");
    expect(field.getAttribute("name")).toBeNull();
    await user.click(check);

    const error = screen.getByRole("alert");
    expect(error.textContent).toMatch(/enter a concern/i);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("rejects whitespace without erasing what was typed", async () => {
    const user = userEvent.setup();
    render(<ResponseComposer />);
    const field = screen.getByRole("textbox", { name: "Your initial concern" }) as HTMLTextAreaElement;

    await user.type(field, "   ");
    await user.click(screen.getByRole("button", { name: "Check response locally" }));

    expect(screen.getByRole("alert").textContent).toMatch(/enter a concern/i);
    expect(field.value).toBe("   ");
    expect(document.activeElement).toBe(field);
  });

  it("reports only a local check for valid synthetic text", async () => {
    const user = userEvent.setup();
    render(<ResponseComposer />);
    const field = screen.getByRole("textbox", { name: "Your initial concern" }) as HTMLTextAreaElement;

    await user.type(field, "I would like to discuss a made-up concern.");
    await user.click(screen.getByRole("button", { name: "Check response locally" }));

    expect(field.value).toBe("I would like to discuss a made-up concern.");
    expect(screen.getByRole("status").textContent).toMatch(/local check complete.*not been saved or sent/i);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/^saved$|^submitted$|ai has processed/i)).toBeNull();
  });
});
