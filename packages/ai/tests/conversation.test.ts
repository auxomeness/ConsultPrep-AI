import { describe, expect, it } from "vitest";
import { acceptsSummaryOffer, classifyConversationIntent, isExplicitSummaryRequest, isNoAdditionalInformation, isPureAcknowledgement } from "../src/conversation.js";

describe("conversation intent handling", () => {
  it.each(["okay thank you", "thanks", "thank you so much", "got it, thanks", "Thanks, that helps", "That makes sense, thank you"])("recognizes a standalone acknowledgment without treating it as an answer: %s", (text) => {
    expect(isPureAcknowledgement(text)).toBe(true);
  });

  it.each(["none, thank you", "thanks, the chills started yesterday", "okay, I have a headache"])("does not mistake clinical content for a standalone acknowledgment: %s", (text) => {
    expect(isPureAcknowledgement(text)).toBe(false);
  });

  it.each(["wrap it up", "Let's finish", "I'm done", "end the interview", "submit my intake", "stop asking questions"])("recognizes explicit finish request: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("finish");
  });

  it("recognizes workflow questions without routing them to symptom questioning", () => {
    expect(classifyConversationIntent({ text: "what should i do with this and what are the next steps?" })).toBe("workflow_question");
  });

  it.each(["what’s next then?", "then what are you going to do next now?", "what should i do next now?"]) (
    "recognizes plain-language next-step questions: %s",
    (text) => expect(classifyConversationIntent({ text })).toBe("workflow_question"),
  );

  it("keeps next-step questions about symptom relief in medical guidance", () => {
    expect(classifyConversationIntent({ text: "What should I do next to ease this headache?" })).toBe("guidance_request");
  });

  it.each([
    "what can i do instead to ease the pain?",
    "can you tell me possible causes?",
    "what could be causing this?",
    "dont you have any tips before i go to the doctor?",
    "dont you have any tips before i go to the doctr?",
    "but what to do in case of these things?",
  ])("recognizes direct requests for practical guidance: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("guidance_request");
  });

  it.each([
    "organize now",
    "aren't you going to summarize this and combine it into a report to the doctor?",
    "okay sure, do me now the summary",
    "show me the consultation notes",
    "show me here in chat",
  ])("recognizes a request to make the clinician summary: %s", (text) => {
    expect(classifyConversationIntent({ text })).toBe("summary");
  });

  it("treats a short yes as a summary request only after the assistant offers one", () => {
    expect(acceptsSummaryOffer("yes", "Would you like me to generate a summary now?")).toBe(true);
    expect(acceptsSummaryOffer("yes please", "We can turn what you shared into a draft consultation summary for you to review and show your doctor. Would you like me to generate it now?")).toBe(true);
    expect(acceptsSummaryOffer("okay sure", "Would you like me to prepare it now? The consultation summary will be ready for you to review.")).toBe(true);
    expect(acceptsSummaryOffer("yes", "When did this begin?")).toBe(false);
    expect(acceptsSummaryOffer("yes please", "I can summarize this later if you ask.")).toBe(false);
    expect(acceptsSummaryOffer("yes pleae", "Would you like me to generate a draft consultation summary now?")).toBe(true);
    expect(acceptsSummaryOffer("yes plese", "Would you like me to generate a draft consultation summary now?")).toBe(true);
  });

  it.each([
    "draft consultation summary now",
    "Please draft my consultation summary",
    "generate the summary",
    "show me my consultation notes",
    "I want to review my notes",
    "Can I see the summary?",
    "show it here",
  ])("recognizes explicit summary workflow requests without needing a pending offer: %s", (text) => {
    expect(isExplicitSummaryRequest(text)).toBe(true);
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

  it("redirects a guessing game instead of treating it as a health detail", () => {
    expect(classifyConversationIntent({ text: "guess what i am feeling right now lol" })).toBe("off_topic");
    expect(classifyConversationIntent({ text: "guess what, I have a headache" })).toBe("continue");
  });

  it.each(["are u sure", "are you sure?", "huh wdym", "wdym", "what do you mean?"]) (
    "recognizes a request to clarify the previous assistant turn: %s",
    (text) => expect(classifyConversationIntent({ text })).toBe("clarification_request"),
  );

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
    expect(isNoAdditionalInformation("No, that’s all. I haven’t noticed anything else.")).toBe(true);
    expect(isNoAdditionalInformation("I have no other symptoms.")).toBe(true);
    expect(isNoAdditionalInformation("No, that’s all, but I have a headache.")).toBe(false);
    expect(isNoAdditionalInformation("I don't know")).toBe(false);
  });
});
