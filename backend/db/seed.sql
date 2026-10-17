-- Synthetic-only, idempotent demonstration seed for local Supabase.
-- Prerequisite: create Auth users with these exact synthetic emails in the local
-- Supabase Auth UI/API. The migration trigger creates patient profiles; this trusted
-- local-only seed promotes the exact synthetic clinician profile.
-- This script does not create passwords or modify existing Auth users.

begin;

do $$
declare
  patient_id uuid;
  clinician_id uuid;
  session_id constant uuid := '10000000-0000-4000-8000-000000000001';
  response_id constant uuid := '20000000-0000-4000-8000-000000000001';
  brief_id constant uuid := '30000000-0000-4000-8000-000000000001';
  case_id constant uuid := '40000000-0000-4000-8000-000000000001';
begin
  select u.id into patient_id
    from auth.users u
   where lower(u.email) = 'patient.demo@consultprep.test';
  select u.id into clinician_id
    from auth.users u
   where lower(u.email) = 'clinician.demo@consultprep.test';

  if patient_id is null or clinician_id is null then
    raise exception 'Create synthetic patient.demo and clinician.demo Auth users before running this seed.';
  end if;

  insert into public.profiles (id, role) values (patient_id, 'patient')
    on conflict (id) do update set role = excluded.role;
  insert into public.profiles (id, role) values (clinician_id, 'clinician')
    on conflict (id) do update set role = excluded.role;

  insert into public.intake_sessions
    (id, patient_id, status, schema_version, submitted_at)
  values
    (session_id, patient_id, 'submitted', 'v1', now())
  on conflict (id) do nothing;

  insert into public.patient_responses
    (id, intake_session_id, sequence, question_text, kind, response_text)
  values
    (response_id, session_id, 1, 'What would you like to discuss at your appointment?', 'reported',
     'Synthetic demo: I have had a mild, intermittent headache for two days.')
  on conflict (id) do nothing;

  insert into public.consultation_briefs
    (id, intake_session_id, version, schema_version, status, data, generated_by)
  values
    (brief_id, session_id, 1, 'demo-v1', 'patient_confirmed',
     '{"primaryConcern":{"state":"reported","text":"Mild, intermittent headache for two days"},"unknowns":[],"unanswered":[],"unclear":[],"conflicts":[]}'::jsonb,
     'synthetic-seed')
  on conflict (id) do nothing;

  insert into public.brief_source_references
    (id, brief_id, intake_session_id, field_path, patient_response_id, source_excerpt)
  values
    ('50000000-0000-4000-8000-000000000001', brief_id, session_id,
     'primaryConcern.text', response_id,
     'Synthetic demo: I have had a mild, intermittent headache for two days.')
  on conflict (id) do nothing;

  insert into public.consultation_cases
    (id, intake_session_id, brief_id, status, assigned_clinician_id, submitted_at)
  values
    (case_id, session_id, brief_id, 'submitted', clinician_id, now())
  on conflict (id) do nothing;
end;
$$;

commit;
