import { z } from "zod";

export const SCHEMA_VERSION = "1.0" as const;

export const InformationStatusSchema = z.enum([
  "reported",
  "patient_denied",
  "patient_corrected",
  "declined",
  "unknown",
  "not_answered",
  "not_asked",
  "unclear",
  "conflicting",
]);
export type InformationStatus = z.infer<typeof InformationStatusSchema>;

export const PatientResponseSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(8_000),
  sequence: z.number().int().nonnegative(),
  questionId: z.string().min(1).optional(),
  questionBankId: z.string().min(1).optional(),
  questionBankIds: z.array(z.string().min(1)).max(20).optional(),
  correctsResponseId: z.string().min(1).optional(),
  createdAt: z.string().datetime().optional(),
});
export type PatientResponse = z.infer<typeof PatientResponseSchema>;

export const IntakeFieldSchema = z.object({
  fieldId: z.string().min(1),
  value: z.string().max(4_000).nullable(),
  status: InformationStatusSchema,
  sourceResponseIds: z.array(z.string().min(1)).max(20),
});
export type IntakeField = z.infer<typeof IntakeFieldSchema>;

export const QuestionHistoryEntrySchema = z.object({
  questionId: z.string().min(1),
  targetField: z.string().min(1),
  status: z.enum(["not_selected", "selected", "asked", "answered", "partially_answered", "skipped", "declined", "requires_clarification"]),
  sourceResponseIds: z.array(z.string().min(1)).max(20),
});
export type QuestionHistoryEntry = z.infer<typeof QuestionHistoryEntrySchema>;

export const SafetyEventSchema = z.object({
  routed: z.boolean(),
  ruleId: z.string().min(1).nullable(),
  guidance: z.string().max(1_000).nullable(),
  matchedResponseIds: z.array(z.string().min(1)).max(20),
});
export type SafetyEvent = z.infer<typeof SafetyEventSchema>;

export const GuidanceRecordSchema = z.object({
  text: z.string().min(1).max(2_000),
  category: z.enum(["general_information", "prompt_assessment", "urgent_safety"]),
  sourceResponseIds: z.array(z.string().min(1)).min(1).max(20),
});
export type GuidanceRecord = z.infer<typeof GuidanceRecordSchema>;

export const IntakeStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  concern: z.string().max(8_000),
  responses: z.array(PatientResponseSchema).max(300),
  // A short assistant window discourages repeated acknowledgments. Patient
  // responses remain the complete source of truth.
  recentAssistantMessages: z.array(z.string().max(2_000)).max(8).optional(),
  fields: z.array(IntakeFieldSchema).max(100),
  questionsAsked: z.array(z.string().max(500)).max(100),
  questionHistory: z.array(QuestionHistoryEntrySchema).max(100).optional(),
  activeQuestionId: z.string().min(1).optional(),
  activeQuestionIds: z.array(z.string().min(1)).max(20).optional(),
  communicationPreferences: z.object({
    questionFormat: z.enum(["plain", "bullets"]).optional(),
    questionPacing: z.enum(["one_at_a_time", "grouped"]).optional(),
  }).optional(),
  completion: z.enum(["in_progress", "ready_for_review", "completed", "emergency_interrupted"]),
  currentIntent: z.enum(["recall_request", "format_preference", "clarification_request", "off_topic", "finish", "summary", "workflow_question", "guidance_request", "personal_concern", "correction", "repetition_complaint", "decline", "unclear", "identity_question", "eye_care_navigation", "care_service_request", "frightened_about_dying", "greeting", "vague_opening", "ambiguous_opening", "continue"]).optional(),
  patientConfirmed: z.boolean().optional(),
  safety: SafetyEventSchema.optional(),
  guidanceProvided: z.array(GuidanceRecordSchema).max(50).optional(),
});
export type IntakeState = z.infer<typeof IntakeStateSchema>;

export const FieldUpdateSchema = IntakeFieldSchema;
export type FieldUpdate = z.infer<typeof FieldUpdateSchema>;

export const NextTurnResultSchema = z.object({
  assistantMessage: z.string().min(1).max(2_000),
  askedQuestion: z.string().max(500).nullable(),
  askedQuestionId: z.string().min(1).nullable().optional(),
  askedQuestionIds: z.array(z.string().min(1)).max(20).optional(),
  fieldUpdates: z.array(FieldUpdateSchema).max(30),
  guidanceProvided: GuidanceRecordSchema.optional(),
});
export type NextTurnResult = z.infer<typeof NextTurnResultSchema>;

export const StartIntakeResultSchema = z.object({
  assistantMessage: z.string().min(1).max(500),
  state: IntakeStateSchema,
});
export type StartIntakeResult = z.infer<typeof StartIntakeResultSchema>;

export const ConsultationBriefSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  status: z.literal("ai_generated_draft"),
  primaryConcern: IntakeFieldSchema,
  fields: z.array(IntakeFieldSchema).max(100),
  unansweredOrUnclear: z.array(z.string().max(500)).max(100),
  contradictions: z.array(z.string().max(500)).max(100),
});
export type ConsultationBrief = z.infer<typeof ConsultationBriefSchema>;

export const ContinueIntakeInputSchema = z.object({
  state: IntakeStateSchema,
  latestResponseId: z.string().min(1).optional(),
});
export type ContinueIntakeInput = z.infer<typeof ContinueIntakeInputSchema>;

export const GenerateBriefInputSchema = z.object({ state: IntakeStateSchema });
export type GenerateBriefInput = z.infer<typeof GenerateBriefInputSchema>;

export const AnswerQuestionInputSchema = z.object({
  question: z.string().trim().min(1).max(8_000),
  conversationHistory: z.array(z.object({
    question: z.string().max(2_000),
    answer: z.string().max(4_000),
  })).max(10).optional(),
});
export type AnswerQuestionInput = z.infer<typeof AnswerQuestionInputSchema>;

export const QuestionAnswerResultSchema = z.object({
  scope: z.enum(["medical", "system", "out_of_scope"]),
  answer: z.string().min(1).max(4_000),
});
export type QuestionAnswerResult = z.infer<typeof QuestionAnswerResultSchema>;

export function validateIntakeState(input: unknown): IntakeState {
  const state = IntakeStateSchema.parse(input);
  const responseIds = new Set(state.responses.map((response) => response.id));
  const sequences = new Set<number>();
  const responseById = new Map(state.responses.map((response) => [response.id, response]));
  for (const response of state.responses) {
    if (sequences.has(response.sequence)) {
      throw new Error(`Duplicate response sequence ${response.sequence}`);
    }
    sequences.add(response.sequence);
    if (response.correctsResponseId && !responseIds.has(response.correctsResponseId)) {
      throw new Error(`Correction references missing response ${response.correctsResponseId}`);
    }
    if (response.correctsResponseId && (responseById.get(response.correctsResponseId)?.sequence ?? Infinity) >= response.sequence) {
      throw new Error(`Correction ${response.id} must follow the response it corrects`);
    }
    if (response.correctsResponseId === response.id) {
      throw new Error(`Response ${response.id} cannot correct itself`);
    }
  }
  validateFieldSourceIds([...state.fields], responseIds);
  for (const guidance of state.guidanceProvided ?? []) {
    for (const responseId of guidance.sourceResponseIds) {
      if (!responseIds.has(responseId)) throw new Error(`Guidance references unknown response ${responseId}`);
    }
  }
  for (const entry of state.questionHistory ?? []) {
    if (["answered", "partially_answered", "skipped", "declined", "requires_clarification"].includes(entry.status) && entry.sourceResponseIds.length === 0) {
      throw new Error(`Question ${entry.questionId} requires a response source for status ${entry.status}`);
    }
    for (const responseId of entry.sourceResponseIds) {
      if (!responseIds.has(responseId)) throw new Error(`Question ${entry.questionId} references unknown response ${responseId}`);
    }
  }
  return state;
}

export function validateFieldSourceIds(fields: IntakeField[], allowedIds: Set<string>): void {
  const fieldIds = new Set<string>();
  for (const field of fields) {
    if (fieldIds.has(field.fieldId)) throw new Error(`Duplicate field ${field.fieldId}`);
    fieldIds.add(field.fieldId);

    const needsSource = ["reported", "patient_denied", "patient_corrected", "declined", "unclear", "conflicting"].includes(field.status);
    if (needsSource && field.sourceResponseIds.length === 0) {
      throw new Error(`Field ${field.fieldId} requires a patient source`);
    }
    if (["reported", "patient_denied", "patient_corrected"].includes(field.status) && !field.value?.trim()) {
      throw new Error(`Field ${field.fieldId} requires a value for ${field.status}`);
    }
    if (["unknown", "not_answered", "not_asked", "declined"].includes(field.status) && field.value !== null) {
      throw new Error(`Field ${field.fieldId} must have a null value for ${field.status}`);
    }
    for (const responseId of field.sourceResponseIds) {
      if (!allowedIds.has(responseId)) throw new Error(`Field ${field.fieldId} references unknown response ${responseId}`);
    }
  }
}

export const BriefFactSchema = z.object({
  text: z.string().min(1),
  status: InformationStatusSchema,
  sourceResponseIds: z.array(z.string().min(1)).min(1),
  originalText: z.array(z.string().min(1)).min(1),
});

export const StructuredConsultationBriefSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  status: z.enum(["ai_generated_draft", "patient_confirmed"]),
  patientReportedNarrative: BriefFactSchema.optional(),
  patientIdentification: z.array(BriefFactSchema).default([]),
  reasonForConsultation: z.array(BriefFactSchema).default([]),
  currentSymptoms: z.array(BriefFactSchema).default([]),
  symptomTimeline: z.array(BriefFactSchema).default([]),
  relevantBackground: z.array(BriefFactSchema).default([]),
  associatedSymptoms: z.array(BriefFactSchema).default([]),
  importantUnansweredQuestions: z.array(z.object({
    fieldId: z.string().min(1),
    question: z.string().min(1),
    importance: z.enum(["important", "optional"]),
    status: z.enum(["not_asked", "unknown", "declined", "unclear", "conflicting", "partially_answered"]),
  })).default([]),
  patientConcernsAndQuestions: z.array(BriefFactSchema).default([]),
  automatedSafetyFlags: z.array(z.object({
    ruleId: z.string(),
    message: z.string(),
    sourceResponseIds: z.array(z.string()).min(1),
  })).default([]),
  guidanceProvided: z.array(GuidanceRecordSchema).default([]),
  intakeCompleteness: z.object({
    status: z.enum(["known", "unknown", "clarification_needed", "potentially_urgent", "sufficiently_covered"]),
    reviewStatus: z.literal("provisional_requires_clinician_review"),
    meaning: z.string(),
    openRequiredQuestionIds: z.array(z.string()),
    clarificationQuestionIds: z.array(z.string()),
    concerns: z.array(z.object({
      symptomId: z.string(),
      label: z.string(),
      category: z.string(),
      status: z.enum(["known", "unknown", "clarification_needed", "potentially_urgent", "sufficiently_covered"]),
      criteria: z.array(z.object({
        id: z.string(),
        questionId: z.string(),
        symptomId: z.string(),
        label: z.string(),
        requiredForWorkflow: z.boolean(),
        status: z.enum(["known", "unknown", "clarification_needed", "potentially_urgent", "sufficiently_covered"]),
        informationStatus: z.enum(["reported", "patient_denied", "patient_corrected", "declined", "unknown", "not_answered", "not_asked", "unclear", "conflicting"]),
        asked: z.boolean(),
        sourceResponseIds: z.array(z.string()),
      })),
    })),
    urgentRuleId: z.string().nullable(),
  }),
  clinicianReviewStatus: z.enum(["not_available", "not_reviewed", "reviewed"]).default("not_available"),
  primaryConcern: z.array(BriefFactSchema),
  reportedSymptoms: z.array(BriefFactSchema),
  onsetAndProgression: z.array(BriefFactSchema),
  functionalImpact: z.array(BriefFactSchema),
  additionalSymptoms: z.array(BriefFactSchema),
  informationNotEstablished: z.array(z.string()),
  safetyRelevantStatements: z.array(BriefFactSchema),
  sourceTraceability: z.array(z.object({ responseId: z.string(), originalText: z.string() })),
});
export type StructuredConsultationBrief = z.infer<typeof StructuredConsultationBriefSchema>;

export function validateBrief(input: unknown, state: IntakeState): ConsultationBrief {
  const brief = ConsultationBriefSchema.parse(input);
  const responseIds = new Set(state.responses.map((response) => response.id));
  validateFieldSourceIds([brief.primaryConcern, ...brief.fields], responseIds);
  return brief;
}
