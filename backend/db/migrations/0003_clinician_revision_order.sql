-- Add an immutable, per-case revision sequence so the final record always
-- identifies exactly which clinician draft it finalizes.
BEGIN;

ALTER TABLE public.clinician_revisions
  ADD COLUMN revision_number integer;

WITH ranked_revisions AS (
  SELECT id, row_number() OVER (PARTITION BY case_id ORDER BY created_at, id)::integer AS revision_number
  FROM public.clinician_revisions
)
UPDATE public.clinician_revisions AS revisions
SET revision_number = ranked_revisions.revision_number
FROM ranked_revisions
WHERE revisions.id = ranked_revisions.id;

ALTER TABLE public.clinician_revisions
  ALTER COLUMN revision_number SET NOT NULL,
  ADD CONSTRAINT clinician_revisions_case_number_unique UNIQUE (case_id, revision_number),
  ADD CONSTRAINT clinician_revisions_number_positive CHECK (revision_number > 0);

COMMIT;
