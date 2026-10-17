-- RLS integration checks for a local Supabase database.
-- Requires the 0001 migration and db/seed.sql plus four synthetic Auth users:
-- patient.demo@consultprep.test, patient.other@consultprep.test,
-- clinician.demo@consultprep.test, clinician.other@consultprep.test.
-- Run with a trusted local database connection; the transaction is rolled back.
\set ON_ERROR_STOP on

do $$
begin
  if (select count(*) from auth.users where lower(email) in (
    'patient.demo@consultprep.test',
    'patient.other@consultprep.test',
    'clinician.demo@consultprep.test',
    'clinician.other@consultprep.test'
  )) <> 4 then
    raise exception 'Create all four synthetic Auth users before running RLS tests.';
  end if;
end;
$$;

begin;
insert into public.profiles (id, role)
select u.id, case
  when lower(u.email) = 'clinician.demo@consultprep.test' then 'clinician'::public.app_role
  when lower(u.email) = 'clinician.other@consultprep.test' then 'clinician'::public.app_role
  else 'patient'::public.app_role
end
from auth.users u
where lower(u.email) in (
  'patient.demo@consultprep.test',
  'patient.other@consultprep.test',
  'clinician.demo@consultprep.test',
  'clinician.other@consultprep.test'
)
on conflict (id) do update set role = excluded.role;

select id as other_patient_id from auth.users where lower(email) = 'patient.other@consultprep.test' \gset
select id as assigned_clinician_id from auth.users where lower(email) = 'clinician.demo@consultprep.test' \gset
select id as other_clinician_id from auth.users where lower(email) = 'clinician.other@consultprep.test' \gset

set local role authenticated;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', :'other_patient_id', true);
do $$
begin
  if exists (select 1 from public.intake_sessions where id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'RLS failure: another patient can read the seeded intake.';
  end if;
  if exists (select 1 from public.patient_responses where intake_session_id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'RLS failure: another patient can read source responses.';
  end if;
  if exists (select 1 from public.consultation_cases where id = '40000000-0000-4000-8000-000000000001') then
    raise exception 'RLS failure: another patient can read the case.';
  end if;
end;
$$;

-- A patient cannot promote their own role. RLS may reject the statement or update zero rows.
do $$
declare changed_rows integer;
begin
  begin
    update public.profiles set role = 'clinician' where id = auth.uid();
    get diagnostics changed_rows = row_count;
    if changed_rows <> 0 then
      raise exception 'RLS failure: patient changed their own role.';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Direct client writes are intentionally denied; writes must pass through server authorization.
do $$
begin
  begin
    insert into public.patient_responses (intake_session_id, sequence, kind, response_text)
    values ('10000000-0000-4000-8000-000000000001', 99, 'reported', 'synthetic unauthorized write');
    raise exception 'RLS failure: authenticated client inserted a response directly.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', :'other_clinician_id', true);
do $$
begin
  if exists (select 1 from public.consultation_cases where id = '40000000-0000-4000-8000-000000000001') then
    raise exception 'RLS failure: an unassigned clinician can read the case.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', :'assigned_clinician_id', true);
do $$
begin
  if not exists (select 1 from public.consultation_cases where id = '40000000-0000-4000-8000-000000000001') then
    raise exception 'RLS failure: the assigned clinician cannot read the case.';
  end if;
  if not exists (select 1 from public.brief_source_references where brief_id = '30000000-0000-4000-8000-000000000001') then
    raise exception 'RLS failure: the assigned clinician cannot read source references.';
  end if;
end;
$$;

rollback;
