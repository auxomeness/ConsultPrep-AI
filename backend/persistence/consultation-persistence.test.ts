import test from "node:test";
import assert from "node:assert/strict";
import {
  recordPatientCorrection,
  submitConfirmedIntake,
  type BriefSnapshot,
  type ConsultationPersistenceTransaction,
  type PatientResponseRecord,
  type SavedSubmission,
  type SourceReference,
} from "./consultation-persistence.ts";
import { assertTransition, type SessionStatus } from "./lifecycle.ts";

const patientId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const briefId = "33333333-3333-4333-8333-333333333333";
const responseId = "44444444-4444-4444-8444-444444444444";
const requestKey = "55555555-5555-4555-8555-555555555555";

class MemoryDb {
  state: {
    session: { id: string; patientId: string; status: SessionStatus; submittedAt: string | null };
    responses: PatientResponseRecord[];
    brief: BriefSnapshot;
    consultationCase: SavedSubmission["consultationCase"] | null;
    receipt: { idempotencyKey: string; intakeSessionId: string; caseId: string } | null;
  } = {
    session: { id: sessionId, patientId, status: "confirmed_by_patient", submittedAt: null },
    responses: [{ id: responseId, intakeSessionId: sessionId, sequence: 1, questionId: "q1", questionText: "What happened?", kind: "reported" as const, responseText: "Original account", supersedesResponseId: null }],
    brief: { id: briefId, intakeSessionId: sessionId, status: "patient_confirmed" as const, schemaVersion: "v1", data: { concern: "Corrected account", details: ["item"] }, sourceReferences: [{ fieldPath: "concern", patientResponseId: responseId, sourceExcerpt: "Original account" }] as SourceReference[] } satisfies BriefSnapshot,
    consultationCase: null as SavedSubmission["consultationCase"] | null,
    receipt: null as { idempotencyKey: string; intakeSessionId: string; caseId: string } | null,
  };
  corruptReadback = false;

  async transaction<T>(work: (tx: ConsultationPersistenceTransaction) => Promise<T>): Promise<T> {
    const state = structuredClone(this.state);
    const tx: ConsultationPersistenceTransaction = {
      lockIntakeSession: async (id) => id === state.session.id ? state.session : null,
      findReceiptByKey: async (key) => state.receipt?.idempotencyKey === key ? state.receipt : null,
      findCaseBySession: async (id) => id === state.consultationCase?.intakeSessionId ? state.consultationCase : null,
      findBrief: async (id, session) => id === state.brief.id && session === state.brief.intakeSessionId ? state.brief : null,
      findResponseIds: async (session, ids) => state.responses.filter((r) => r.intakeSessionId === session && ids.includes(r.id)).map((r) => r.id),
      insertSubmittedCase: async ({ sessionId: sid, briefId: bid }) => {
        const record = { id: "66666666-6666-4666-8666-666666666666", intakeSessionId: sid, briefId: bid, status: "submitted" as const };
        state.consultationCase = record;
        return record;
      },
      setSessionSubmitted: async (_id, submittedAt) => { state.session = { ...state.session, status: "submitted", submittedAt }; },
      insertReceipt: async ({ idempotencyKey, sessionId: sid, caseId }) => { state.receipt = { idempotencyKey, intakeSessionId: sid, caseId }; },
      readSavedSubmission: async (sid, key) => {
        if (sid !== state.session.id || !state.consultationCase) return null;
        const storedKey = state.receipt?.idempotencyKey ?? key;
        const brief = this.corruptReadback ? { ...state.brief, data: { concern: "wrong" } } : state.brief;
        return { session: state.session, brief, consultationCase: state.consultationCase, idempotencyKey: storedKey };
      },
      findResponse: async (sid, id) => state.responses.find((r) => r.id === id && r.intakeSessionId === sid) ?? null,
      nextResponseSequence: async (sid) => Math.max(0, ...state.responses.filter((r) => r.intakeSessionId === sid).map((r) => r.sequence)) + 1,
      insertCorrection: async (row) => { state.responses.push(row); return row; },
    };
    const result = await work(tx);
    this.state = state;
    return result;
  }
}

const submit = (db: MemoryDb, idempotencyKey = requestKey) => submitConfirmedIntake(db, {
  actor: { userId: patientId, role: "patient" }, sessionId, briefId, idempotencyKey,
});

test("submission persists one case and verifies the read-back snapshot", async () => {
  const db = new MemoryDb();
  const result = await submit(db);
  assert.equal(result.replayed, false);
  assert.equal(db.state.session.status, "submitted");
  assert.equal(db.state.consultationCase?.briefId, briefId);
  assert.equal(db.state.receipt?.idempotencyKey, requestKey);
  assert.ok(result.submission.session.submittedAt);
});

test("retry with the same idempotency key returns the same case", async () => {
  const db = new MemoryDb();
  const first = await submit(db);
  const second = await submit(db);
  assert.equal(second.replayed, true);
  assert.equal(second.submission.consultationCase.id, first.submission.consultationCase.id);
});

test("mismatched read-back fails and rolls back all writes", async () => {
  const db = new MemoryDb();
  db.corruptReadback = true;
  await assert.rejects(submit(db), { code: "PERSISTENCE_FAILED" });
  assert.equal(db.state.session.status, "confirmed_by_patient");
  assert.equal(db.state.consultationCase, null);
  assert.equal(db.state.receipt, null);
});

test("source references must resolve to responses in this intake", async () => {
  const db = new MemoryDb();
  db.state.brief.sourceReferences[0]!.patientResponseId = "77777777-7777-4777-8777-777777777777";
  await assert.rejects(submit(db), { code: "PERSISTENCE_FAILED" });
  assert.equal(db.state.consultationCase, null);
});

test("patient correction appends a superseding response and preserves the original", async () => {
  const db = new MemoryDb();
  db.state.session.status = "ready_for_review";
  const correction = await recordPatientCorrection(db, {
    actor: { userId: patientId, role: "patient" }, sessionId,
    supersedesResponseId: responseId, responseText: "Corrected account",
  });
  assert.equal(db.state.responses.length, 2);
  assert.equal(db.state.responses[0]?.responseText, "Original account");
  assert.equal(correction.supersedesResponseId, responseId);
  assert.equal(correction.sequence, 2);
});

test("lifecycle rejects skipped or reversed transitions", () => {
  assertTransition("session", "confirmed_by_patient", "submitted");
  assert.throws(() => assertTransition("session", "in_progress", "submitted"), { code: "INVALID_TRANSITION" });
  assert.throws(() => assertTransition("case", "finalized", "under_clinician_review"), { code: "INVALID_TRANSITION" });
});
