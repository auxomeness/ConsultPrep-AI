import { describe, expect, it } from "vitest";
import { classifyConversationIntent, isNoAdditionalInformation } from "../src/conversation.js";

describe("conversation intent handling", () => {
  it.each(["wrap it up", "Let's finish", "I'm done", "end the interview", "submit my intake", "stop asking questions"])("recognizes explicit finish request: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("finish");
  });

  it("recognizes workflow questions without routing them to symptom questioning", () => {
    expect(classifyConversationIntent({ text: "what should i do with this and what are the next steps?" })).toBe("workflow_question");
  });

  it.each(["what’s next then?", "then what are you going to do next now?"]) (
    "recognizes plain-language next-step questions: %s",
    (text) => expect(classifyConversationIntent({ text })).toBe("workflow_question"),
  );

  it.each([
    "what can i do instead to ease the pain?",
    "dont you have any tips before i go to the doctor?",
    "dont you have any tips before i go to the doctr?",
    "but what to do in case of these things?",
  ])("recognizes direct requests for practical guidance: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("guidance_request");
  });

  it.each([
    "organize now",
    "aren't you going to summarize this and combine it into a report to the doctor?",
  ])("recognizes a request to make the clinician summary: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("summary");
  });

  it("recognizes a request to repeat all of the patient's earlier messages", () => {
    expect(classifyConversationIntent({ text: "tell me everything i said" })).toBe("recall_request");
  });

  it("recognizes an ambiguous opening without treating it as patient evidence", () => {
    expect(classifyConversationIntent({ text: "clear", isFirstPatientTurn: true })).toBe("ambiguous_opening");
    expect(classifyConversationIntent({ text: "i feel cold", isFirstPatientTurn: true })).toBe("continue");
  });

  it("handles a greeting warmly instead of treating it as an unclear answer", () => {
    expect(classifyConversationIntent({ text: "hi", isFirstPatientTurn: true })).toBe("greeting");
    expect(classifyConversationIntent({ text: "hello!", isFirstPatientTurn: true })).toBe("greeting");
    expect(classifyConversationIntent({ text: "hi", isFirstPatientTurn: false })).toBe("greeting");
  });

  it.each(["I already answered", "I already said that", "I told you already", "You asked me that already"]) (
    "recognizes a standalone repetition complaint without treating it as a fact: %s",
    (text) => expect(classifyConversationIntent({ text })).toBe("repetition_complaint"),
  );

  it("keeps a correction with actual health information out of the repetition-complaint intent", () => {
    expect(classifyConversationIntent({ text: "I already said it felt crushing" })).toBe("correction");
  });

  it.each(["never said that", "I didn't say that", "That's not what I said", "you made that up"]) (
    "recognizes a correction to an assistant misattribution: %s",
    (text) => expect(classifyConversationIntent({ text })).toBe("correction"),
  );

  it.each(["who are you", "what are you?", "are you a doctor?", "what can you do"])("recognizes a question about ConsultPrep: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("identity_question");
  });

  it.each([
    "i am going through something",
    "something is bothering me",
    "I don't feel right",
    "something feels off",
    "I feel weird",
    "I'm not feeling myself",
    "I'm worried about my health",
    "I'm not sure what's wrong",
  ])("handles vague health-related opening gently without presuming symptoms: %s", (text) => {
    expect(classifyConversationIntent({ text, isFirstPatientTurn: true })).toBe("vague_opening");
  });

  it("does not intercept a vague phrase after the interview has started", () => {
    expect(classifyConversationIntent({ text: "I don't feel right", isFirstPatientTurn: false })).toBe("continue");
  });

  it.each([
    "Please find me a cardiologist",
    "I need a cardio specialist",
    "Can I get an X-ray?",
    "Where can I get imaging?",
  ])("recognizes a care-service request for clinician discussion: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("care_service_request");
  });

  it("does not mistake a past service for a request", () => {
    expect(classifyConversationIntent({ text: "I had an X-ray last week" })).toBe("continue");
  });

  it("routes eye soreness care-location questions to the eye-care guidance", () => {
    expect(classifyConversationIntent({ text: "my eyes are sore, where should i get help" })).toBe("eye_care_navigation");
    expect(classifyConversationIntent({ text: "where can I go for painful eyes" })).toBe("eye_care_navigation");
  });

  it("recognizes fear of dying as a distress statement that needs an empathetic response", () => {
    expect(classifyConversationIntent({ text: "I feel like I'm gonna die" })).toBe("frightened_about_dying");
    expect(classifyConversationIntent({ text: "I'm scared I might die" })).toBe("frightened_about_dying");
  });

  it("interprets no-additional-information phrases without conflating other short answers", () => {
    expect(isNoAdditionalInformation("none")).toBe(true);
    expect(isNoAdditionalInformation("none, thank you")).toBe(true);
    expect(isNoAdditionalInformation("I don't know")).toBe(false);
  });
});
