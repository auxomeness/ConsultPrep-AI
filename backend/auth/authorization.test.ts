import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanFinalizeCase,
  assertCanSaveClinicianRevision,
  assertCanSubmitIntake,
  AuthorizationError,
  requireAssignedClinician,
  requirePatientOwner,
  type Actor,
  type ConsultationCaseAccess,
  type IntakeSessionAccess,
} from "./authorization.ts";

const patient: Actor = { userId: "patient-a", role: "patient" };
const otherPatient: Actor = { userId: "patient-b", role: "patient" };
const clinician: Actor = { userId: "clinician-a", role: "clinician" };
const otherClinician: Actor = { userId: "clinician-b", role: "clinician" };

const ownedSession: IntakeSessionAccess = {
  patientId: patient.userId,
  status: "confirmed_by_patient",
};
const assignedCase: ConsultationCaseAccess = {
  assignedClinicianId: clinician.userId,
  status: "under_clinician_review",
};

function assertAuthorizationError(
  action: () => unknown,
  code: AuthorizationError["code"],
  httpStatus: number,
) {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof AuthorizationError);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, httpStatus);
    return true;
  });
}

test("rejects unauthenticated access", () => {
  assertAuthorizationError(() => requirePatientOwner(null, ownedSession), "UNAUTHENTICATED", 401);
});

test("prevents one patient from reading or submitting another patient's intake", () => {
  assertAuthorizationError(() => requirePatientOwner(otherPatient, ownedSession), "NOT_FOUND", 404);
  assertAuthorizationError(() => assertCanSubmitIntake(otherPatient, ownedSession), "NOT_FOUND", 404);
});

test("prevents a clinician from using patient-only ownership operations", () => {
  assertAuthorizationError(() => requirePatientOwner(clinician, ownedSession), "FORBIDDEN", 403);
});

test("allows patient submission only after explicit patient confirmation", () => {
  assert.equal(assertCanSubmitIntake(patient, ownedSession), patient);
  assertAuthorizationError(
    () => assertCanSubmitIntake(patient, { ...ownedSession, status: "ready_for_review" }),
    "INVALID_TRANSITION",
    409,
  );
});

test("limits clinician access to an explicitly assigned case", () => {
  assert.equal(requireAssignedClinician(clinician, assignedCase), clinician);
  assertAuthorizationError(() => requireAssignedClinician(otherClinician, assignedCase), "NOT_FOUND", 404);
  assertAuthorizationError(
    () => requireAssignedClinician(clinician, { ...assignedCase, assignedClinicianId: null }),
    "NOT_FOUND",
    404,
  );
  assertAuthorizationError(() => requireAssignedClinician(patient, assignedCase), "FORBIDDEN", 403);
});

test("prevents editing or finalizing finalized cases", () => {
  const finalized: ConsultationCaseAccess = {
    assignedClinicianId: clinician.userId,
    status: "finalized",
  };
  assertAuthorizationError(() => assertCanSaveClinicianRevision(clinician, finalized), "INVALID_TRANSITION", 409);
  assertAuthorizationError(() => assertCanFinalizeCase(clinician, finalized), "INVALID_TRANSITION", 409);
});

test("requires assignment and review state before clinician finalization", () => {
  assert.equal(assertCanFinalizeCase(clinician, assignedCase), clinician);
  assertAuthorizationError(
    () => assertCanFinalizeCase(otherClinician, assignedCase),
    "NOT_FOUND",
    404,
  );
  assertAuthorizationError(
    () => assertCanFinalizeCase(clinician, { ...assignedCase, status: "submitted" }),
    "INVALID_TRANSITION",
    409,
  );
});
