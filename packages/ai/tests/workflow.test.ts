import { describe, expect, it } from "vitest";
import { applyIntakeTurn, confirmPatientBrief, recordPatientAnswer, recordPatientCorrection } from "../src/workflow.js";
import { nextRequiredInterviewQuestion, planNextQuestion } from "../src/service.js";
import type { IntakeState } from "../src/contracts.js";

const state: IntakeState = {
  schemaVersion: "1.0",
  concern: "My eyes are sore",
  responses: [
    { id: "r1", text: "My eyes are sore", sequence: 0 },
    { id: "r2", text: "It started today", sequence: 1, questionId: "When did these symptoms start?" },
  ],
  fields: [
    { fieldId: "eye_soreness", value: "Eye soreness", status: "reported", sourceResponseIds: ["r1"] },
    { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r2"] },
  ],
  questionsAsked: ["When did these symptoms start?"],
  completion: "ready_for_review",
  patientConfirmed: false,
};

describe("patient correction and completion transitions", () => {
  it("records a summary request without extracting it as a clinical answer", () => {
    const active: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a headache.", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      questionsAsked: ["Where is the headache?"] ,
      questionHistory: [{ questionId: "headache_location", targetField: "headache_location", status: "asked", sourceResponseIds: [] }],
      activeQuestionId: "headache_location",
      completion: "in_progress",
    };
    const recorded = recordPatientAnswer(active, "Organize now");
    expect(recorded.state.responses.at(-1)?.text).toBe("Organize now");
    expect(recorded.state.fields).toEqual(active.fields);
    expect(recorded.state.questionHistory).toEqual(active.questionHistory);
    expect(recorded.state.currentIntent).toBe("summary");
  });

  it("treats yes please as accepting the assistant's contextual summary offer", () => {
    const offered = {
      ...state,
      recentAssistantMessages: ["We can turn what you shared into a draft consultation summary for you to review. Would you like me to generate it now?"],
      fields: [{ fieldId: "sore_throat", value: "Sore throat", status: "reported" as const, sourceResponseIds: ["r1"] }],
      completion: "in_progress" as const,
    };

    const accepted = recordPatientAnswer(offered, "yes please");

    expect(accepted.state.currentIntent).toBe("summary");
    expect(accepted.state.fields).toContainEqual(expect.objectContaining({ fieldId: "sore_throat", value: "Sore throat" }));
    expect(accepted.state.fields.every((field) => !field.sourceResponseIds.includes(accepted.responseId))).toBe(true);
    expect(accepted.state.questionHistory).toEqual(offered.questionHistory);
  });

  it("keeps a bare correction of an assistant misattribution out of the clinical facts", () => {
    const active: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a headache.", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      questionsAsked: ["For the cold symptoms you mentioned, what are you noticing in your nose, throat, or ears?"],
      activeQuestionId: "ent_location",
      completion: "in_progress",
    };
    const recorded = recordPatientAnswer(active, "never said that");
    expect(recorded.state.responses.at(-1)?.text).toBe("never said that");
    expect(recorded.state.fields).toEqual(active.fields);
    expect(recorded.state.currentIntent).toBe("correction");
  });

  it("records a direct pain-relief question without treating it as a headache location answer", () => {
    const active: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a headache.", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      questionsAsked: ["Where do you feel the headache, and does it stay there or move?"],
      activeQuestionId: "headache_location",
      completion: "in_progress",
    };
    const recorded = recordPatientAnswer(active, "What can I do instead to ease the pain?");
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({
      fieldId: "patient_question",
      value: "What can I do instead to ease the pain",
      sourceResponseIds: [recorded.responseId],
    }));
    expect(recorded.state.fields.some((field) => field.fieldId === "headache_location" && field.sourceResponseIds.includes(recorded.responseId))).toBe(false);
  });

  it("keeps a possible-causes question as a side turn and leaves the pending intake question active", () => {
    const active: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a headache.", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      questionsAsked: ["When did the headache begin?"],
      activeQuestionId: "symptom_onset__headache",
      completion: "in_progress",
    };
    const recorded = recordPatientAnswer(active, "Can you tell me possible causes?");
    expect(recorded.state.currentIntent).toBe("guidance_request");
    expect(recorded.state.activeQuestionId).toBe("symptom_onset__headache");
    expect(recorded.state.responses.at(-1)?.text).toBe("Can you tell me possible causes?");
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({
      fieldId: "patient_question",
      value: "Can you tell me possible causes",
      sourceResponseIds: [recorded.responseId],
    }));
    expect(recorded.state.fields.some((field) => field.fieldId.startsWith("symptom_onset_") && field.sourceResponseIds.includes(recorded.responseId))).toBe(false);
  });

  it("accumulates separate patient questions rather than marking them as conflicting reports", () => {
    const first = recordPatientAnswer(state, "What can I do to ease the pain?");
    const second = recordPatientAnswer(first.state, "Do you have any tips before I see a doctor?");
    expect(second.state.fields).toContainEqual(expect.objectContaining({
      fieldId: "patient_question",
      value: "What can I do to ease the pain; Do you have any tips before I see a doctor",
      status: "reported",
      sourceResponseIds: [first.responseId, second.responseId],
    }));
  });

  it("keeps workflow questions in the transcript without treating them as clinical questions", () => {
    const active: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a headache.", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      questionsAsked: ["Where do you feel the headache?"],
      activeQuestionId: "headache_location",
      completion: "in_progress",
    };

    const recorded = recordPatientAnswer(active, "What's next then?");

    expect(recorded.state.responses.at(-1)?.text).toBe("What's next then?");
    expect(recorded.state.fields).toEqual(active.fields);
    expect(recorded.state.currentIntent).toBe("workflow_question");
  });

  it("keeps a no-other-symptoms answer when the same message asks what to do", () => {
    const active: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a crushing headache and cramping.", sequence: 0 }],
      fields: [
        { fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "cramping", value: "Cramping", status: "reported", sourceResponseIds: ["r1"] },
      ],
      questionsAsked: ["Have you noticed any other changes along with the headache?"],
      questionHistory: [{ questionId: "headache_associated", targetField: "headache_associated_changes", status: "asked", sourceResponseIds: [] }],
      activeQuestionId: "headache_associated",
      completion: "in_progress",
    };

    const recorded = recordPatientAnswer(active, "none, just that, maybe it’s a migraine idk what should i do");
    expect(recorded.state.currentIntent).toBe("guidance_request");
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({
      fieldId: "headache_associated_changes",
      value: "No other changes reported; headache remains",
      status: "patient_denied",
      sourceResponseIds: [recorded.responseId],
    }));
    expect(recorded.state.fields.some((field) => field.fieldId === "headache_location" && field.sourceResponseIds.includes(recorded.responseId))).toBe(false);
  });

  it.each([
    ["not sure", "unknown"],
    ["idk", "unknown"],
    ["let's not do that", "declined"],
    ["can we skip this", "declined"],
  ])("records %s for an active onset question and moves on", (answer, status) => {
    const onsetQuestion: IntakeState = {
      ...state,
      concern: "I have a headache",
      responses: [{ id: "r1", text: "I have a headache", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      questionsAsked: ["When did the headache begin?"],
      questionHistory: [{ questionId: "symptom_onset__headache", targetField: "symptom_onset", status: "asked", sourceResponseIds: [] }],
      activeQuestionId: "symptom_onset__headache",
      completion: "in_progress",
    };

    const recorded = recordPatientAnswer(onsetQuestion, answer);
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({
      fieldId: "symptom_onset_headache",
      value: null,
      status,
      sourceResponseIds: [recorded.responseId],
    }));
    expect(recorded.state.questionHistory?.at(-1)).toMatchObject({ status: status === "declined" ? "declined" : "answered" });
    expect(planNextQuestion(recorded.state)?.questionId).toBe("headache_location");
  });

  it("records an answer with source-linked extracted facts and applies the next AI turn", () => {
    const openingState: IntakeState = {
      schemaVersion: "1.0",
      concern: "",
      responses: [],
      fields: [],
      questionsAsked: ["What have you been feeling?"],
      questionHistory: [{ questionId: "main_concern", targetField: "primary_concern", status: "asked", sourceResponseIds: [] }],
      activeQuestionId: "main_concern",
      completion: "in_progress",
    };

    const recorded = recordPatientAnswer(openingState, "I have a headache since this morning");
    expect(recorded.responseId).toBe("response-1");
    expect(recorded.state.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: "headache", status: "reported", sourceResponseIds: [recorded.responseId] }),
      expect.objectContaining({ fieldId: "symptom_onset_headache", status: "reported", sourceResponseIds: [recorded.responseId] }),
    ]));
    expect(recorded.state.questionHistory?.[0]).toMatchObject({ status: "answered", sourceResponseIds: [recorded.responseId] });

    const continued = applyIntakeTurn(recorded.state, {
      askedQuestion: "Where is the headache?",
      askedQuestionId: "headache_location",
      fieldUpdates: [],
    });
    expect(continued.activeQuestionId).toBe("headache_location");
    expect(continued.questionsAsked.at(-1)).toBe("Where is the headache?");
    expect(continued.responses).toEqual(recorded.state.responses);
  });

  it("keeps the active question while the assistant answers a side question", () => {
    const stateWithQuestion: IntakeState = {
      ...state,
      activeQuestionId: "headache_associated",
      questionsAsked: ["Have you noticed any other changes along with the headache?"],
      responses: [{ id: "r1", text: "What can I do today?", sequence: 0, questionBankId: "headache_associated" }],
    };
    const continued = applyIntakeTurn(stateWithQuestion, {
      askedQuestion: null,
      askedQuestionId: null,
      fieldUpdates: [],
    });
    expect(continued.activeQuestionId).toBe("headache_associated");
  });

  it("does not turn a repetition complaint into symptom facts or overwrite facts already captured", () => {
    const stateWithKnownLocation: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "My headache stays at the front", sequence: 0 }],
      fields: [{ fieldId: "headache_location", value: "Front of my head; Does not move", status: "reported", sourceResponseIds: ["r1"] }],
      activeQuestionId: "headache_location",
      questionsAsked: ["Where do you feel the headache, and does it stay there or move?"],
      questionHistory: [{ questionId: "headache_location", targetField: "headache_location", status: "asked", sourceResponseIds: [] }],
    };

    const recorded = recordPatientAnswer(stateWithKnownLocation, "I already answered");

    expect(recorded.state.fields.find((field) => field.fieldId === "headache_location")).toEqual(stateWithKnownLocation.fields[0]);
    expect(recorded.state.fields.every((field) => !field.sourceResponseIds.includes(recorded.responseId))).toBe(true);
    expect(recorded.state.responses.at(-1)?.questionBankId).toBe("headache_location");
    expect(recorded.state.questionHistory?.at(-1)).toMatchObject({ status: "answered", sourceResponseIds: ["r1"] });
    expect(recorded.state.currentIntent).toBe("repetition_complaint");
  });

  it("leaves an unanswered repeated question blank and marks it skipped instead of re-asking", () => {
    const unanswered: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a headache", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      activeQuestionId: "headache_location",
      questionsAsked: ["Where do you feel the headache, and does it stay there or move?"],
      questionHistory: [{ questionId: "headache_location", targetField: "headache_location", status: "asked", sourceResponseIds: [] }],
    };

    const recorded = recordPatientAnswer(unanswered, "I already said that");
    const applied = applyIntakeTurn(recorded.state, { assistantMessage: "I’ll leave that blank for now.", fieldUpdates: [], askedQuestion: null });

    expect(recorded.state.fields.find((field) => field.fieldId === "headache_location")).toBeUndefined();
    expect(recorded.state.fields.find((field) => field.fieldId === "correction_note")).toBeUndefined();
    expect(recorded.state.questionHistory?.at(-1)).toMatchObject({ status: "skipped", sourceResponseIds: [recorded.responseId] });
    expect(applied.activeQuestionId).toBeUndefined();
    expect(applied.recentAssistantMessages?.at(-1)).toBe("I’ll leave that blank for now.");
  });

  it("keeps the original correction source and applies the corrected onset with its own source", () => {
    const corrected = recordPatientCorrection(state, "Correction: it started yesterday, not today");
    expect(corrected.responses[2]).toMatchObject({ correctsResponseId: "r2", text: "Correction: it started yesterday, not today" });
    expect(corrected.responses[1]?.text).toBe("It started today");
    expect(corrected.fields.find((field) => field.fieldId === "onset")).toMatchObject({ value: "Yesterday", status: "patient_corrected", sourceResponseIds: ["response-3"] });
  });

  it("corrects the timeline for the named symptom without rewriting another symptom's onset", () => {
    const symptomState: IntakeState = {
      ...state,
      fields: [
        ...state.fields,
        { fieldId: "visual_changes", value: "Blurry vision", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_eye_soreness", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_visual_changes", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
      ],
    };
    const corrected = recordPatientCorrection(symptomState, "Correction: blurry vision started yesterday, not today");
    expect(corrected.fields.find((field) => field.fieldId === "symptom_onset_visual_changes")).toMatchObject({ value: "Yesterday", status: "patient_corrected", sourceResponseIds: ["response-3"] });
    expect(corrected.fields.find((field) => field.fieldId === "symptom_onset_eye_soreness")).toMatchObject({ value: "Today", status: "reported", sourceResponseIds: ["r1"] });
  });

  it("records patient confirmation locally and keeps repeated completion idempotent", () => {
    const confirmed = confirmPatientBrief(state);
    expect(confirmed).toMatchObject({ completion: "completed", patientConfirmed: true });
    expect(confirmPatientBrief(confirmed)).toEqual(confirmed);
    expect(nextRequiredInterviewQuestion(confirmed)).toBeNull();
  });

  it("records a natural no-more-symptoms reply as answered so the interview will not ask again", () => {
    const active: IntakeState = {
      ...state,
      responses: [{ id: "r1", text: "I have a sore throat and a runny nose.", sequence: 0 }],
      fields: [
        { fieldId: "sore_throat", value: "Sore throat", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "runny_nose", value: "Runny nose", status: "reported", sourceResponseIds: ["r1"] },
      ],
      questionsAsked: ["Have you noticed any other symptoms along with this?"],
      questionHistory: [{ questionId: "additional_symptoms", targetField: "additional_symptoms", status: "asked", sourceResponseIds: [] }],
      activeQuestionId: "additional_symptoms",
      completion: "in_progress",
    };

    const recorded = recordPatientAnswer(active, "No, that’s all. I haven’t noticed anything else.");

    expect(recorded.state.fields).toContainEqual(expect.objectContaining({
      fieldId: "additional_symptoms",
      value: "No additional symptoms reported",
      status: "patient_denied",
      sourceResponseIds: [recorded.responseId],
    }));
    expect(recorded.state.questionHistory).toContainEqual(expect.objectContaining({
      questionId: "additional_symptoms",
      status: "answered",
      sourceResponseIds: [recorded.responseId],
    }));
    expect(planNextQuestion(recorded.state)?.questionId).not.toBe("additional_symptoms");
    expect(planNextQuestion(recorded.state)?.questionId).not.toBe("ent_related");
  });
});
