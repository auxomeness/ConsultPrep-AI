const LANDING_DRAFT_KEY = "consultprep-landing-preview-draft";

// One-time handoff within this browser tab; never a patient record or server save.
export function storeLandingDraft(value: string) {
  try {
    if (value) sessionStorage.setItem(LANDING_DRAFT_KEY, value);
    else sessionStorage.removeItem(LANDING_DRAFT_KEY);
  } catch {
    // The intake preview remains reachable if browser storage is unavailable.
  }
}

export function takeLandingDraft(): string | null {
  try {
    const value = sessionStorage.getItem(LANDING_DRAFT_KEY);
    sessionStorage.removeItem(LANDING_DRAFT_KEY);
    return value;
  } catch {
    return null;
  }
}
