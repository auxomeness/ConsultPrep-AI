import { ApiError } from "../api/errors.ts";

export type SessionStatus = "in_progress" | "ready_for_review" | "confirmed_by_patient" | "submitted";
export type BriefStatus = "draft" | "patient_confirmed" | "clinician_finalized";
export type CaseStatus = "submitted" | "under_clinician_review" | "finalized";

const transitions = {
  session: {
    in_progress: ["ready_for_review"],
    ready_for_review: ["confirmed_by_patient"],
    confirmed_by_patient: ["submitted"],
    submitted: [],
  },
  brief: {
    draft: ["patient_confirmed"],
    patient_confirmed: ["clinician_finalized"],
    clinician_finalized: [],
  },
  case: {
    submitted: ["under_clinician_review"],
    under_clinician_review: ["finalized"],
    finalized: [],
  },
} as const;

export function assertTransition<K extends keyof typeof transitions>(
  entity: K,
  from: keyof (typeof transitions)[K],
  to: string,
): void {
  const allowed = transitions[entity][from] as readonly string[] | undefined;
  if (!allowed?.includes(to)) throw new ApiError("INVALID_TRANSITION");
}

export function assertPatientCanCorrect(status: SessionStatus): void {
  if (status !== "in_progress" && status !== "ready_for_review") {
    throw new ApiError("INVALID_TRANSITION");
  }
}
