import { describe, expect, it } from "vitest";
import { assessSafety } from "../src/safety.js";

describe("deterministic synthetic safety routes", () => {
  it("interrupts routine intake for the documented severe chest pain fixture", () => {
    const event = assessSafety({ responses: [{ id: "r1", text: "I have severe chest pain", sequence: 0 }] });
    expect(event.routed).toBe(true);
    expect(event.matchedResponseIds).toEqual(["r1"]);
    expect(event.guidance).toMatch(/contact local emergency services/i);
    expect(event.guidance).toMatch(/stopping the intake/i);
  });

  it("interrupts for the documented breathing difficulty fixture", () => {
    expect(assessSafety({ responses: [{ id: "r1", text: "I have difficulty breathing", sequence: 0 }] }).routed).toBe(true);
  });

  it("uses a supportive, specific ending for shortness of breath with palpitations", () => {
    const event = assessSafety({ responses: [{ id: "r1", text: "I feel shortness of breath and palpitating", sequence: 0 }] });
    expect(event).toMatchObject({ routed: true, ruleId: "shortness_of_breath_with_palpitations" });
    expect(event.guidance).toMatch(/I’m sorry you’re experiencing this/i);
    expect(event.guidance).toMatch(/local emergency number now/i);
    expect(event.guidance).toMatch(/stopping the intake/i);
  });

  it("routes eye pain with blurry vision to urgent eye assessment before routine intake", () => {
    const event = assessSafety({ responses: [
      { id: "r1", text: "My eyes are sore and getting worse", sequence: 0 },
      { id: "r2", text: "I am seeing blurry", sequence: 1 },
    ] });
    expect(event).toMatchObject({ routed: true, ruleId: "eye_symptoms_with_visual_change_requires_urgent_assessment", matchedResponseIds: ["r1", "r2"] });
    expect(event.guidance).toMatch(/assessed urgently by an eye-care professional today/i);
    expect(event.guidance).toMatch(/stopping the intake/i);
  });

  it.each([
    "I suddenly lost my vision",
    "I have severe eye pain",
    "I injured my eye",
    "Something is stuck in my eye",
    "A strong chemical splashed into my eye",
  ])("routes an eye emergency warning sign immediately: %s", (text) => {
    expect(assessSafety({ responses: [{ id: "eye", text, sequence: 0 }] })).toMatchObject({ routed: true, ruleId: "emergency_eye_warning_sign" });
  });

  it.each([
    ["I suddenly became confused", "new_confusion_or_loss_of_consciousness"],
    ["I passed out", "new_confusion_or_loss_of_consciousness"],
    ["I suddenly have severe weakness on one side", "severe_or_sudden_weakness"],
  ])("interrupts routine intake for synthetic urgent symptom %s", (text, ruleId) => {
    expect(assessSafety({ responses: [{ id: "urgent", text, sequence: 0 }] })).toMatchObject({ routed: true, ruleId });
  });

  it("interrupts when a patient reports being unable to move", () => {
    const event = assessSafety({ responses: [{ id: "r1", text: "I cannot move and feel very weak", sequence: 0 }] });
    expect(event).toMatchObject({ routed: true, ruleId: "reported_inability_to_move", matchedResponseIds: ["r1"] });
    expect(event.guidance).toMatch(/local emergency service/i);
  });

  it("does not route a clear negation or hypothetical as a reported symptom", () => {
    expect(assessSafety({ responses: [{ id: "r1", text: "I do not have difficulty breathing", sequence: 0 }] }).routed).toBe(false);
    expect(assessSafety({ responses: [{ id: "r1", text: "I don't have any trouble breathing", sequence: 0 }] }).routed).toBe(false);
    expect(assessSafety({ responses: [{ id: "r1", text: "What if I cannot move?", sequence: 0 }] }).routed).toBe(false);
  });

  it("does not label routine synthetic text as urgent", () => {
    expect(assessSafety({ responses: [{ id: "r1", text: "Mild headache since yesterday", sequence: 0 }] }).routed).toBe(false);
  });
});
