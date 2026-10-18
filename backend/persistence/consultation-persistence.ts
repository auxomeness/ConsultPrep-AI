import { ApiError } from "../api/errors.ts";
import { requirePatientOwner, type Actor } from "../auth/authorization.ts";
import { assertPatientCanCorrect, type SessionStatus } from "./lifecycle.ts";

export type SourceReference = {
  fieldPath: string;
  patientResponseId: string;
  sourceExcerpt: string | null;
};

export type BriefSnapshot = {
  id: string;
  intakeSessionId: string;
  status: "draft" | "patient_confirmed" | "clinician_finalized";
  schemaVersion: string;
  data: Record<string, unknown>;
  sourceReferences: SourceReference[];
};

export type SavedSubmission = {
  session: { id: string; patientId: string; status: SessionStatus; submittedAt: string | null };
  brief: BriefSnapshot;
  consultationCase: { id: string; intakeSessionId: string; briefId: string; status: "submitted" };
  idempotencyKey: string;
};

export type PatientResponseRecord = {
  id: string;
  intakeSessionId: string;
  sequence: number;
  questionId: string | null;
  questionText: string | null;
  kind: "reported" | "unknown" | "skipped";
  responseText: string | null;
  supersedesResponseId: string | null;
};

/** Adapter contract: implementations must execute each callback in one real DB
 * transaction. lockIntakeSession must use SELECT ... FOR UPDATE (or equivalent)
 * so simultaneous submits serialize on the same intake. */
export interface ConsultationPersistenceTransaction {
  lockIntakeSession(id: string): Promise<{ id: string; patientId: string; status: SessionStatus; submittedAt: string | null } | null>;
  findReceiptByKey(key: string): Promise<{ idempotencyKey: string; intakeSessionId: string; caseId: string } | null>;
  findCaseBySession(sessionId: string): Promise<{ id: string; intakeSessionId: string; briefId: string; status: "submitted" } | null>;
  findBrief(briefId: string, sessionId: string): Promise<BriefSnapshot | null>;
  findResponseIds(sessionId: string, responseIds: string[]): Promise<string[]>;
  insertSubmittedCase(input: { sessionId: string; briefId: string }): Promise<{ id: string; intakeSessionId: string; briefId: string; status: "submitted" }>;
  setSessionSubmitted(sessionId: string, submittedAt: string): Promise<void>;
  insertReceipt(input: { idempotencyKey: string; sessionId: string; caseId: string }): Promise<void>;
  readSavedSubmission(sessionId: string, idempotencyKey: string): Promise<SavedSubmission | null>;
  findResponse(sessionId: string, responseId: string): Promise<PatientResponseRecord | null>;
  nextResponseSequence(sessionId: string): Promise<number>;
  insertCorrection(input: Omit<PatientResponseRecord, "sequence"> & { sequence: number }): Promise<PatientResponseRecord>;
}

export interface ConsultationPersistenceDatabase {
  transaction<T>(work: (tx: ConsultationPersistenceTransaction) => Promise<T>): Promise<T>;
}

export type SubmitConfirmedIntakeInput = {
  actor: Actor;
  sessionId: string;
  briefId: string;
  idempotencyKey: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
    const encoded = JSON.stringify(value);
    if (encoded !== undefined) return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new ApiError("PERSISTENCE_FAILED");
}

function normalizedSources(sources: SourceReference[]): string {
  return canonicalJson(sources.map((source) => ({
    fieldPath: source.fieldPath,
    patientResponseId: source.patientResponseId,
    sourceExcerpt: source.sourceExcerpt,
  })).sort((a, b) => `${a.fieldPath}\0${a.patientResponseId}`.localeCompare(`${b.fieldPath}\0${b.patientResponseId}`)));
}

function verifySavedSubmission(saved: SavedSubmission | null, input: SubmitConfirmedIntakeInput, expectedBrief: BriefSnapshot): SavedSubmission {
  if (!saved) throw new ApiError("PERSISTENCE_FAILED");
  const matches = saved.session.id === input.sessionId &&
    saved.session.patientId === input.actor.userId &&
    saved.session.status === "submitted" && Boolean(saved.session.submittedAt) &&
    saved.brief.id === expectedBrief.id && saved.brief.intakeSessionId === input.sessionId &&
    saved.brief.status === "patient_confirmed" &&
    saved.brief.schemaVersion === expectedBrief.schemaVersion &&
    canonicalJson(saved.brief.data) === canonicalJson(expectedBrief.data) &&
    normalizedSources(saved.brief.sourceReferences) === normalizedSources(expectedBrief.sourceReferences) &&
    saved.consultationCase.intakeSessionId === input.sessionId &&
    saved.consultationCase.briefId === expectedBrief.id && saved.consultationCase.status === "submitted" &&
    saved.idempotencyKey === input.idempotencyKey;
  if (!matches) throw new ApiError("PERSISTENCE_FAILED");
  return saved;
}

/** Persists the patient-confirmed brief, source links, case, status transition,
 * and idempotency receipt atomically. It returns only after reading back and
 * comparing the stored snapshot with the intended submission. */
export async function submitConfirmedIntake(
  db: ConsultationPersistenceDatabase,
  input: SubmitConfirmedIntakeInput,
): Promise<{ submission: SavedSubmission; replayed: boolean }> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![input.idempotencyKey, input.sessionId, input.briefId].every((value) => uuid.test(value))) {
    throw new ApiError("INVALID_REQUEST");
  }
  return db.transaction(async (tx) => {
    const session = await tx.lockIntakeSession(input.sessionId);
    if (!session) throw new ApiError("NOT_FOUND");
    requirePatientOwner(input.actor, { patientId: session.patientId, status: session.status });

    const existingReceipt = await tx.findReceiptByKey(input.idempotencyKey);
    if (existingReceipt && existingReceipt.intakeSessionId !== input.sessionId) {
      throw new ApiError("INVALID_TRANSITION");
    }

    const brief = await tx.findBrief(input.briefId, input.sessionId);
    if (!brief || brief.status !== "patient_confirmed") throw new ApiError("INVALID_TRANSITION");
    const referencedIds = [...new Set(brief.sourceReferences.map((source) => source.patientResponseId))];
    const foundIds = await tx.findResponseIds(input.sessionId, referencedIds);
    if (foundIds.length !== referencedIds.length || referencedIds.some((id) => !foundIds.includes(id))) {
      throw new ApiError("PERSISTENCE_FAILED");
    }

    if (existingReceipt) {
      const saved = verifySavedSubmission(await tx.readSavedSubmission(input.sessionId, input.idempotencyKey), input, brief);
      if (saved.consultationCase.id !== existingReceipt.caseId) throw new ApiError("PERSISTENCE_FAILED");
      return { submission: saved, replayed: true };
    }

    // A case unique constraint is the final protection against a second case.
    // Only the original key is replayable; a new key after submission is a
    // conflict, which avoids pretending that an unrecorded key is idempotent.
    const existingCase = await tx.findCaseBySession(input.sessionId);
    if (existingCase) {
      throw new ApiError("INVALID_TRANSITION");
    }

    if (session.status !== "confirmed_by_patient") throw new ApiError("INVALID_TRANSITION");
    const consultationCase = await tx.insertSubmittedCase({ sessionId: input.sessionId, briefId: brief.id });
    const submittedAt = new Date().toISOString();
    await tx.setSessionSubmitted(input.sessionId, submittedAt);
    await tx.insertReceipt({ idempotencyKey: input.idempotencyKey, sessionId: input.sessionId, caseId: consultationCase.id });
    const submission = verifySavedSubmission(await tx.readSavedSubmission(input.sessionId, input.idempotencyKey), input, brief);
    if (submission.consultationCase.id !== consultationCase.id) throw new ApiError("PERSISTENCE_FAILED");
    return { submission, replayed: false };
  });
}

/** Corrections append a response that points to the earlier response. The
 * original statement is never overwritten; callers must regenerate/revise the
 * patient-confirmed brief so its source references point at the correction. */
export async function recordPatientCorrection(
  db: ConsultationPersistenceDatabase,
  input: { actor: Actor; sessionId: string; supersedesResponseId: string; responseText: string },
): Promise<PatientResponseRecord> {
  const responseText = input.responseText.trim();
  if (!responseText || responseText.length > 10_000) throw new ApiError("INVALID_REQUEST");
  return db.transaction(async (tx) => {
    const session = await tx.lockIntakeSession(input.sessionId);
    if (!session) throw new ApiError("NOT_FOUND");
    requirePatientOwner(input.actor, { patientId: session.patientId, status: session.status });
    assertPatientCanCorrect(session.status);
    const original = await tx.findResponse(input.sessionId, input.supersedesResponseId);
    if (!original) throw new ApiError("NOT_FOUND");
    return tx.insertCorrection({
      id: crypto.randomUUID(),
      intakeSessionId: session.id,
      sequence: await tx.nextResponseSequence(session.id),
      questionId: original.questionId,
      questionText: original.questionText,
      kind: "reported",
      responseText,
      supersedesResponseId: original.id,
    });
  });
}
