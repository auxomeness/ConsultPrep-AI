import type { ReviewData } from "../components/patient/PatientReview";

// Synthetic presentation fixture shaped to Member 1's v1.0 contract.
// These values were not produced by AI and are not stored in Member 2's database.
const responses: ReviewData["responses"] = [
  { id: "r1", sequence: 0, text: "I have a headache near my forehead." },
  { id: "r2", sequence: 1, text: "I don't know how long it usually lasts." },
  { id: "r3", sequence: 2, text: "Sometimes." },
  { id: "r4", sequence: 3, text: "I first noticed it Monday." },
  { id: "r5", sequence: 4, text: "I first noticed it Wednesday." },
  { id: "r6", sequence: 5, text: "Correction: the headache is near my temples.", correctsResponseId: "r1" },
];

const fields: ReviewData["fields"] = [
  { fieldId: "main_concern", value: "Headache near my temples", status: "patient_corrected", sourceResponseIds: ["r6"] },
  { fieldId: "usual_duration", value: null, status: "unknown", sourceResponseIds: ["r2"] },
  { fieldId: "frequency", value: "Sometimes", status: "unclear", sourceResponseIds: ["r3"] },
  { fieldId: "previous_episodes", value: null, status: "not_answered", sourceResponseIds: [] },
  { fieldId: "onset", value: null, status: "conflicting", sourceResponseIds: ["r4", "r5"] },
];

const sourceTraceability = responses.map(({ id, text }) => ({ responseId: id, originalText: text }));

export const reviewFixture: ReviewData = {
  origin: "synthetic_fixture",
  responses,
  fields,
  brief: {
    schemaVersion: "1.0",
    status: "ai_generated_draft",
    patientIdentification: [],
    reasonForConsultation: [],
    currentSymptoms: [],
    symptomTimeline: [],
    relevantBackground: [],
    associatedSymptoms: [],
    importantUnansweredQuestions: [
      { fieldId: "usual_duration", question: "How long does it usually last?", importance: "optional", status: "unknown" },
      { fieldId: "onset", question: "When did this begin?", importance: "important", status: "conflicting" },
    ],
    patientConcernsAndQuestions: [],
    automatedSafetyFlags: [],
    intakeCompleteness: {
      status: "clarification_needed",
      reviewStatus: "provisional_requires_clinician_review",
      meaning: "Synthetic example with unresolved information; this is not a clinical assessment.",
      openRequiredQuestionIds: [],
      clarificationQuestionIds: [],
      concerns: [],
      urgentRuleId: null,
    },
    clinicianReviewStatus: "not_available",
    primaryConcern: [
      { text: "Headache near the temples", status: "patient_corrected", sourceResponseIds: ["r6"], originalText: [responses[5].text] },
    ],
    reportedSymptoms: [],
    onsetAndProgression: [
      { text: "The stated onset differs between responses.", status: "conflicting", sourceResponseIds: ["r4", "r5"], originalText: [responses[3].text, responses[4].text] },
    ],
    functionalImpact: [],
    additionalSymptoms: [],
    informationNotEstablished: ["Usual duration is unknown.", "Frequency is unclear.", "Previous episodes were not answered.", "Onset remains conflicting."],
    safetyRelevantStatements: [],
    sourceTraceability,
  },
};
