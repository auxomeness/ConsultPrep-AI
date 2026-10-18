import { ApiError } from "../api/errors.ts";
import {
  assertCanFinalizeCase,
  assertCanSaveClinicianRevision,
  requireActor,
  requireAssignedClinician,
  type Actor,
} from "../auth/authorization.ts";
import { assertTransition, type BriefStatus, type CaseStatus } from "./lifecycle.ts";
import type { BriefSnapshot, PatientResponseRecord } from "./consultation-persistence.ts";

export type ClinicianRevisionRecord = {
  id: string;
  caseId: string;
  revisionNumber: number;
  clinicianId: string;
  action: "draft_saved" | "finalized";
  briefData: Record<string, unknown>;
  createdAt: string;
};

export type ClinicianCaseRecord = {
  id: string;
  intakeSessionId: string;
  briefId: string;
  status: CaseStatus;
  assignedClinicianId: string | null;
  submittedAt: string;
  finalizedAt: string | null;
};

export type ClinicianCaseReview = {
  consultationCase: ClinicianCaseRecord;
  brief: BriefSnapshot;
  responses: PatientResponseRecord[];
  revisions: ClinicianRevisionRecord[];
};

/** The transaction implementation must lock the case row, scope all lookups
 * to the case's intake, and commit or roll back revisions/statuses together. */
export interface ClinicianReviewTransaction {
  lockCase(caseId: string): Promise<ClinicianCaseRecord | null>;
  nextRevisionNumber(caseId: string): Promise<number>;
  readCaseReview(caseId: string): Promise<ClinicianCaseReview | null>;
  insertRevision(input: Omit<ClinicianRevisionRecord, "id" | "createdAt">): Promise<{ id: string }>;
  readRevision(revisionId: string): Promise<ClinicianRevisionRecord | null>;
  setCaseStatus(caseId: string, status: CaseStatus, finalizedAt: string | null): Promise<void>;
  setBriefStatus(briefId: string, status: BriefStatus): Promise<void>;
  readCaseState(caseId: string): Promise<{ status: CaseStatus; assignedClinicianId: string | null; finalizedAt: string | null } | null>;
  readBriefStatus(briefId: string): Promise<BriefStatus | null>;
}

export interface ClinicianReviewDatabase {
  listCasesAssignedTo(clinicianId: string): Promise<ClinicianCaseRecord[]>;
  readCaseReview(caseId: string): Promise<ClinicianCaseReview | null>;
  transaction<T>(work: (tx: ClinicianReviewTransaction) => Promise<T>): Promise<T>;
}

function validateBriefData(input: unknown): Record<string, unknown> {
  const visiting = new Set<object>();
  const visit = (value: unknown): boolean => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "object" && value !== null) {
      const prototype = Object.getPrototypeOf(value);
      if (visiting.has(value)) return false;
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
      visiting.add(value);
      const valid = (Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)).every(visit);
      visiting.delete(value);
      return valid;
    }
    return false;
  };
  if (typeof input !== "object" || input === null || Array.isArray(input) || !visit(input)) {
    throw new ApiError("INVALID_REQUEST");
  }
  return input as Record<string, unknown>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded !== undefined) return encoded;
    throw new ApiError("INVALID_REQUEST");
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
}

export async function listClinicianCases(db: ClinicianReviewDatabase, actorInput: Actor | null): Promise<ClinicianCaseRecord[]> {
  const actor = requireActor(actorInput);
  if (actor.role !== "clinician") throw new ApiError("FORBIDDEN");
  const cases = await db.listCasesAssignedTo(actor.userId);
  return cases.filter((item) => item.assignedClinicianId === actor.userId);
}

export async function getClinicianCaseReview(
  db: ClinicianReviewDatabase,
  actorInput: Actor | null,
  caseId: string,
): Promise<ClinicianCaseReview> {
  const actor = requireActor(actorInput);
  if (actor.role !== "clinician") throw new ApiError("FORBIDDEN");
  const review = await db.readCaseReview(caseId);
  if (!review) throw new ApiError("NOT_FOUND");
  requireAssignedClinician(actor, review.consultationCase);
  if (review.brief.id !== review.consultationCase.briefId || review.brief.intakeSessionId !== review.consultationCase.intakeSessionId ||
    review.responses.some((response) => response.intakeSessionId !== review.consultationCase.intakeSessionId) ||
    review.brief.sourceReferences.some((source) => !review.responses.some((response) => response.id === source.patientResponseId))) {
    throw new ApiError("PERSISTENCE_FAILED");
  }
  return review;
}

export async function saveClinicianDraft(
  db: ClinicianReviewDatabase,
  input: { actor: Actor; caseId: string; briefData: unknown },
): Promise<ClinicianRevisionRecord> {
  const briefData = validateBriefData(input.briefData);
  return db.transaction(async (tx) => {
    const consultationCase = await tx.lockCase(input.caseId);
    if (!consultationCase) throw new ApiError("NOT_FOUND");
    assertCanSaveClinicianRevision(input.actor, consultationCase);
    if (consultationCase.status === "submitted") assertTransition("case", "submitted", "under_clinician_review");

    const inserted = await tx.insertRevision({
      caseId: consultationCase.id,
      revisionNumber: await tx.nextRevisionNumber(consultationCase.id),
      clinicianId: input.actor.userId,
      action: "draft_saved",
      briefData,
    });
    if (consultationCase.status === "submitted") {
      await tx.setCaseStatus(consultationCase.id, "under_clinician_review", null);
    }
    const saved = await tx.readRevision(inserted.id);
    const state = await tx.readCaseState(consultationCase.id);
    if (!saved || !state || saved.caseId !== consultationCase.id || saved.clinicianId !== input.actor.userId ||
      saved.action !== "draft_saved" || stableJson(saved.briefData) !== stableJson(briefData) ||
      state.assignedClinicianId !== input.actor.userId || state.status !== "under_clinician_review") {
      throw new ApiError("PERSISTENCE_FAILED");
    }
    return saved;
  });
}

export async function finalizeClinicianCase(
  db: ClinicianReviewDatabase,
  input: { actor: Actor; caseId: string },
): Promise<ClinicianRevisionRecord> {
  return db.transaction(async (tx) => {
    const consultationCase = await tx.lockCase(input.caseId);
    if (!consultationCase) throw new ApiError("NOT_FOUND");
    assertCanFinalizeCase(input.actor, consultationCase);
    assertTransition("case", "under_clinician_review", "finalized");
    const review = await tx.readCaseReview(consultationCase.id);
    if (!review) throw new ApiError("NOT_FOUND");
    requireAssignedClinician(input.actor, review.consultationCase);
    if (review.brief.id !== consultationCase.briefId || review.brief.intakeSessionId !== consultationCase.intakeSessionId ||
      review.responses.some((response) => response.intakeSessionId !== consultationCase.intakeSessionId) ||
      review.brief.sourceReferences.some((source) => !review.responses.some((response) => response.id === source.patientResponseId))) {
      throw new ApiError("PERSISTENCE_FAILED");
    }
    if (review.brief.status === "clinician_finalized") throw new ApiError("INVALID_TRANSITION");
    if (review.brief.status !== "patient_confirmed") throw new ApiError("INVALID_TRANSITION");

    const latestRevision = [...review.revisions].sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
    if (latestRevision?.action === "finalized") throw new ApiError("INVALID_TRANSITION");
    const finalData = validateBriefData(latestRevision?.briefData ?? review.brief.data);
    const inserted = await tx.insertRevision({
      caseId: consultationCase.id,
      revisionNumber: await tx.nextRevisionNumber(consultationCase.id),
      clinicianId: input.actor.userId,
      action: "finalized",
      briefData: finalData,
    });
    const finalizedAt = new Date().toISOString();
    await tx.setBriefStatus(review.brief.id, "clinician_finalized");
    await tx.setCaseStatus(consultationCase.id, "finalized", finalizedAt);

    const saved = await tx.readRevision(inserted.id);
    const state = await tx.readCaseState(consultationCase.id);
    const briefStatus = await tx.readBriefStatus(review.brief.id);
    if (!saved || !state || !briefStatus || saved.caseId !== consultationCase.id ||
      saved.clinicianId !== input.actor.userId || saved.action !== "finalized" ||
      stableJson(saved.briefData) !== stableJson(finalData) || state.status !== "finalized" ||
      state.assignedClinicianId !== input.actor.userId || !state.finalizedAt || briefStatus !== "clinician_finalized") {
      throw new ApiError("PERSISTENCE_FAILED");
    }
    return saved;
  });
}

