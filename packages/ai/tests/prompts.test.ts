import { describe, expect, it } from "vitest";
import { CONTINUE_OUTPUT_INSTRUCTIONS, SYSTEM_INSTRUCTIONS } from "../src/prompts.js";

describe("assistant scope instructions", () => {
  it("allows health and system questions but limits unsupported or risky behavior", () => {
    expect(SYSTEM_INSTRUCTIONS).toMatch(/not act as a general-purpose chatbot/i);
    expect(SYSTEM_INSTRUCTIONS).toMatch(/general questions about health or ConsultPrep/i);
    expect(SYSTEM_INSTRUCTIONS).toMatch(/use only the supplied project guidance/i);
    expect(SYSTEM_INSTRUCTIONS).toMatch(/Never diagnose a person/i);
    expect(SYSTEM_INSTRUCTIONS).toMatch(/No vetted clinical reference corpus is currently provided/i);
  });

  it("keeps intake turns concise and lets the application decide when to ask", () => {
    expect(CONTINUE_OUTPUT_INSTRUCTIONS).toMatch(/brief pre-consultation interview and conversation/i);
    expect(CONTINUE_OUTPUT_INSTRUCTIONS).toMatch(/do not generate a follow-up question/i);
    expect(CONTINUE_OUTPUT_INSTRUCTIONS).toMatch(/the application decides whether a planned question is useful/i);
    expect(CONTINUE_OUTPUT_INSTRUCTIONS).toMatch(/answer what they asked in one or two plain-language sentences/i);
  });
});
