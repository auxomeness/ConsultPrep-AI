-- Additive duplicate-submission protection. Apply after 0001_initial.sql.
-- The primary key makes an idempotency key globally unique; one receipt per
-- session and case prevents a second logical submission for either record.
BEGIN;

CREATE TABLE submission_receipts (
  idempotency_key uuid PRIMARY KEY,
  intake_session_id uuid NOT NULL CONSTRAINT submission_receipts_session_unique UNIQUE,
  case_id uuid NOT NULL CONSTRAINT submission_receipts_case_unique UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_receipts_case_same_session_fk
    FOREIGN KEY (case_id, intake_session_id)
    REFERENCES consultation_cases (id, intake_session_id)
    ON DELETE RESTRICT
);

ALTER TABLE submission_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE submission_receipts FROM anon, authenticated;

COMMIT;
