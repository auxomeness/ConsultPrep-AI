export type AppRole = "patient" | "clinician";

export type Actor = {
  userId: string;
  role: AppRole;
};

export type IntakeSessionAccess = {
  patientId: string;
  status: "in_progress" | "ready_for_review" | "confirmed_by_patient" | "submitted";
};

export type ConsultationCaseAccess = {
  assignedClinicianId: string | null;
  status: "submitted" | "under_clinician_review" | "finalized";
};

export type AuthorizationErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TRANSITION";

export class AuthorizationError extends Error {
  public readonly code: AuthorizationErrorCode;
  public readonly httpStatus: 401 | 403 | 404 | 409;

  constructor(
    code: AuthorizationErrorCode,
    message: string,
    httpStatus: 401 | 403 | 404 | 409,
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "AuthorizationError";
  }
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) {
    throw new AuthorizationError("UNAUTHENTICATED", "Authentication is required.", 401);
  }
  return actor;
}

/** Call only after the identity and role have been loaded from trusted server-side sources. */
export function requirePatientOwner(
  untrustedActor: Actor | null,
  session: IntakeSessionAccess,
): Actor {
  const actor = requireActor(untrustedActor);
  if (actor.role !== "patient") {
    throw new AuthorizationError("FORBIDDEN", "Patient access is required.", 403);
  }
  if (actor.userId !== session.patientId) {
    // Do not disclose whether a session owned by someone else exists.
    throw new AuthorizationError("NOT_FOUND", "Intake session not found.", 404);
  }
  return actor;
}

/** Clinician access is limited to cases explicitly assigned to the authenticated clinician. */
export function requireAssignedClinician(
  untrustedActor: Actor | null,
  consultationCase: ConsultationCaseAccess,
): Actor {
  const actor = requireActor(untrustedActor);
  if (actor.role !== "clinician") {
    throw new AuthorizationError("FORBIDDEN", "Clinician access is required.", 403);
  }
  if (!consultationCase.assignedClinicianId || consultationCase.assignedClinicianId !== actor.userId) {
    throw new AuthorizationError("NOT_FOUND", "Consultation case not found.", 404);
  }
  return actor;
}

export function assertCanSubmitIntake(
  actor: Actor | null,
  session: IntakeSessionAccess,
): Actor {
  const patient = requirePatientOwner(actor, session);
  if (session.status !== "confirmed_by_patient") {
    throw new AuthorizationError(
      "INVALID_TRANSITION",
      "The patient must confirm the intake before submission.",
      409,
    );
  }
  return patient;
}

export function assertCanSaveClinicianRevision(
  actor: Actor | null,
  consultationCase: ConsultationCaseAccess,
): Actor {
  const clinician = requireAssignedClinician(actor, consultationCase);
  if (consultationCase.status === "finalized") {
    throw new AuthorizationError(
      "INVALID_TRANSITION",
      "Finalized documentation cannot be edited.",
      409,
    );
  }
  return clinician;
}

export function assertCanFinalizeCase(
  actor: Actor | null,
  consultationCase: ConsultationCaseAccess,
): Actor {
  const clinician = requireAssignedClinician(actor, consultationCase);
  if (consultationCase.status !== "under_clinician_review") {
    throw new AuthorizationError(
      "INVALID_TRANSITION",
      "A case must be under clinician review before it can be finalized.",
      409,
    );
  }
  return clinician;
}
