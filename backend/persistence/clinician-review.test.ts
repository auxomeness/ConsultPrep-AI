import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeClinicianCase,
  getClinicianCaseReview,
  listClinicianCases,
  saveClinicianDraft,
  type ClinicianCaseReview,
  type ClinicianReviewDatabase,
  type ClinicianReviewTransaction,
} from "./clinician-review.ts";

const clinicianId = "11111111-1111-4111-8111-111111111111";
const otherClinicianId = "22222222-2222-4222-8222-222222222222";
const caseId = "33333333-3333-4333-8333-333333333333";
const briefId = "44444444-4444-4444-8444-444444444444";
const sessionId = "55555555-5555-4555-8555-555555555555";
const responseId = "66666666-6666-4666-8666-666666666666";

class MemoryReviewDb implements ClinicianReviewDatabase {
  review: ClinicianCaseReview = {
    consultationCase: {
      id: caseId, intakeSessionId: sessionId, briefId, status: "submitted",
      assignedClinicianId: clinicianId, submittedAt: "2026-10-01T00:00:00.000Z", finalizedAt: null,
    },
    brief: {
      id: briefId, intakeSessionId: sessionId, status: "patient_confirmed", schemaVersion: "demo-v1",
      data: { concern: "Synthetic patient-reported concern", unknowns: ["duration"] },
      sourceReferences: [{ fieldPath: "concern", patientResponseId: responseId, sourceExcerpt: "Synthetic source" }],
    },
    responses: [{ id: responseId, intakeSessionId: sessionId, sequence: 1, questionId: "q1", questionText: "What is your concern?", kind: "reported", responseText: "Synthetic source", supersedesResponseId: null }],
    revisions: [],
  };
  async listCasesAssignedTo(clinician: string) {
    return this.review.consultationCase.assignedClinicianId === clinician ? [this.review.consultationCase] : [];
  }
  async readCaseReview(id: string) { return id === caseId ? structuredClone(this.review) : null; }
  async transaction<T>(work: (tx: ClinicianReviewTransaction) => Promise<T>): Promise<T> {
    const state = structuredClone(this.review);
    const tx: ClinicianReviewTransaction = {
      lockCase: async (id) => id === caseId ? state.consultationCase : null,
      nextRevisionNumber: async (id) => id === caseId ? Math.max(0, ...state.revisions.map((revision) => revision.revisionNumber)) + 1 : 1,
      readCaseReview: async (id) => id === caseId ? state : null,
      insertRevision: async (revision) => {
        const id = `revision-${state.revisions.length + 1}`;
        state.revisions.push({ ...revision, id, createdAt: `2026-10-0${state.revisions.length + 2}T00:00:00.000Z` });
        return { id };
      },
      readRevision: async (id) => state.revisions.find((revision) => revision.id === id) ?? null,
      setCaseStatus: async (_id, status, finalizedAt) => { state.consultationCase = { ...state.consultationCase, status, finalizedAt }; },
      setBriefStatus: async (_id, status) => { state.brief = { ...state.brief, status }; },
      readCaseState: async (id) => id === caseId ? {
        status: state.consultationCase.status,
        assignedClinicianId: state.consultationCase.assignedClinicianId,
        finalizedAt: state.consultationCase.finalizedAt,
      } : null,
      readBriefStatus: async (id) => id === briefId ? state.brief.status : null,
    };
    const result = await work(tx);
    this.review = state;
    return result;
  }
}

const clinician = { userId: clinicianId, role: "clinician" as const };

test("case list and detail are scoped to the assigned clinician", async () => {
  const db = new MemoryReviewDb();
  assert.equal((await listClinicianCases(db, clinician)).length, 1);
  assert.equal((await listClinicianCases(db, { userId: otherClinicianId, role: "clinician" })).length, 0);
  await assert.rejects(getClinicianCaseReview(db, { userId: otherClinicianId, role: "clinician" }, caseId), { code: "NOT_FOUND" });
  await assert.rejects(listClinicianCases(db, { userId: clinicianId, role: "patient" }), { code: "FORBIDDEN" });
});

test("saving a revision appends a snapshot and moves the case into review", async () => {
  const db = new MemoryReviewDb();
  const edited = { concern: "Clinician wording", unknowns: ["duration"] };
  const revision = await saveClinicianDraft(db, { actor: clinician, caseId, briefData: edited });
  assert.equal(revision.action, "draft_saved");
  assert.deepEqual(revision.briefData, edited);
  assert.equal(db.review.consultationCase.status, "under_clinician_review");
  assert.equal(db.review.revisions.length, 1);
  assert.deepEqual(db.review.brief.data, { concern: "Synthetic patient-reported concern", unknowns: ["duration"] });
});

test("finalization records a final snapshot and changes both statuses", async () => {
  const db = new MemoryReviewDb();
  await saveClinicianDraft(db, { actor: clinician, caseId, briefData: { concern: "Clinician-edited" } });
  const final = await finalizeClinicianCase(db, { actor: clinician, caseId });
  assert.equal(final.action, "finalized");
  assert.deepEqual(final.briefData, { concern: "Clinician-edited" });
  assert.equal(db.review.consultationCase.status, "finalized");
  assert.ok(db.review.consultationCase.finalizedAt);
  assert.equal(db.review.brief.status, "clinician_finalized");
});

test("cannot finalize before review or edit after finalization", async () => {
  const db = new MemoryReviewDb();
  await assert.rejects(finalizeClinicianCase(db, { actor: clinician, caseId }), { code: "INVALID_TRANSITION" });
  await saveClinicianDraft(db, { actor: clinician, caseId, briefData: { concern: "Reviewed" } });
  await finalizeClinicianCase(db, { actor: clinician, caseId });
  await assert.rejects(saveClinicianDraft(db, { actor: clinician, caseId, briefData: { concern: "Overwrite" } }), { code: "INVALID_TRANSITION" });
});

test("unauthorized clinician cannot save a revision", async () => {
  const db = new MemoryReviewDb();
  await assert.rejects(saveClinicianDraft(db, {
    actor: { userId: otherClinicianId, role: "clinician" }, caseId, briefData: { concern: "Not allowed" },
  }), { code: "NOT_FOUND" });
  assert.equal(db.review.revisions.length, 0);
});
