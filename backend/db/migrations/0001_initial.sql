-- ConsultPrep AI initial application schema (PostgreSQL / Supabase).
-- Additive migration. Apply only to a confirmed development or staging project first.

create type public.app_role as enum ('patient', 'clinician');
create type public.intake_session_status as enum (
  'in_progress', 'ready_for_review', 'confirmed_by_patient', 'submitted'
);
create type public.patient_response_kind as enum ('reported', 'unknown', 'skipped');
create type public.consultation_brief_status as enum (
  'draft', 'patient_confirmed', 'clinician_finalized'
);
create type public.consultation_case_status as enum (
  'submitted', 'under_clinician_review', 'finalized'
);
create type public.clinician_revision_action as enum ('draft_saved', 'finalized');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  role public.app_role not null default 'patient',
  created_at timestamptz not null default now()
);

-- New Auth identities always receive the least-privileged role. User metadata is ignored.
create function public.create_patient_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'patient')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_create_patient_profile
after insert on auth.users
for each row execute function public.create_patient_profile();

create table public.intake_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete restrict,
  status public.intake_session_status not null default 'in_progress',
  schema_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint intake_sessions_id_patient_unique unique (id, patient_id),
  constraint intake_sessions_submitted_at_matches_status
    check ((status = 'submitted') = (submitted_at is not null))
);
create index intake_sessions_patient_updated_idx
  on public.intake_sessions (patient_id, updated_at desc);

create table public.patient_responses (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(id) on delete restrict,
  sequence integer not null,
  question_id text,
  question_text text,
  kind public.patient_response_kind not null default 'reported',
  response_text text,
  supersedes_response_id uuid,
  created_at timestamptz not null default now(),
  constraint patient_responses_session_sequence_unique unique (intake_session_id, sequence),
  constraint patient_responses_id_session_unique unique (id, intake_session_id),
  constraint patient_responses_supersedes_same_session_fk
    foreign key (supersedes_response_id, intake_session_id)
    references public.patient_responses (id, intake_session_id) on delete restrict,
  constraint patient_responses_sequence_positive check (sequence > 0),
  constraint patient_responses_reported_text_required
    check (kind <> 'reported' or (response_text is not null and length(btrim(response_text)) > 0)),
  constraint patient_responses_not_self_superseding
    check (supersedes_response_id is distinct from id)
);
create index patient_responses_session_created_idx
  on public.patient_responses (intake_session_id, created_at);

create table public.consultation_briefs (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(id) on delete restrict,
  version integer not null,
  schema_version text not null,
  status public.consultation_brief_status not null default 'draft',
  data jsonb not null,
  generated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultation_briefs_session_version_unique unique (intake_session_id, version),
  constraint consultation_briefs_id_session_unique unique (id, intake_session_id),
  constraint consultation_briefs_version_positive check (version > 0),
  constraint consultation_briefs_data_is_object check (jsonb_typeof(data) = 'object')
);
create index consultation_briefs_session_created_idx
  on public.consultation_briefs (intake_session_id, created_at desc);

create table public.brief_source_references (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null,
  intake_session_id uuid not null,
  field_path text not null,
  patient_response_id uuid not null,
  source_excerpt text,
  created_at timestamptz not null default now(),
  constraint brief_source_refs_brief_same_session_fk
    foreign key (brief_id, intake_session_id)
    references public.consultation_briefs (id, intake_session_id) on delete restrict,
  constraint brief_source_refs_response_same_session_fk
    foreign key (patient_response_id, intake_session_id)
    references public.patient_responses (id, intake_session_id) on delete restrict,
  constraint brief_source_refs_unique unique (brief_id, field_path, patient_response_id),
  constraint brief_source_refs_field_path_nonempty check (length(btrim(field_path)) > 0)
);
create index brief_source_refs_response_idx
  on public.brief_source_references (patient_response_id);

create table public.consultation_cases (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null unique references public.intake_sessions(id) on delete restrict,
  brief_id uuid not null unique,
  status public.consultation_case_status not null default 'submitted',
  assigned_clinician_id uuid references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultation_cases_id_session_unique unique (id, intake_session_id),
  constraint consultation_cases_brief_same_session_fk
    foreign key (brief_id, intake_session_id)
    references public.consultation_briefs (id, intake_session_id) on delete restrict,
  constraint consultation_cases_finalized_at_matches_status
    check ((status = 'finalized') = (finalized_at is not null))
);
create index consultation_cases_clinician_status_idx
  on public.consultation_cases (assigned_clinician_id, status);

create table public.clinician_revisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.consultation_cases(id) on delete restrict,
  clinician_id uuid not null references public.profiles(id) on delete restrict,
  action public.clinician_revision_action not null,
  brief_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint clinician_revisions_data_is_object check (jsonb_typeof(brief_data) = 'object')
);
create index clinician_revisions_case_created_idx
  on public.clinician_revisions (case_id, created_at desc);

-- Keep the helper outside Supabase's exposed API schemas. SECURITY DEFINER avoids
-- recursive RLS when a policy checks an assignment and returns only a boolean.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create function private.is_assigned_clinician(p_intake_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.consultation_cases c
      join public.profiles p on p.id = (select auth.uid())
     where c.intake_session_id = p_intake_session_id
       and c.assigned_clinician_id = (select auth.uid())
       and p.role = 'clinician'
  );
$$;
revoke all on function private.is_assigned_clinician(uuid) from public;
grant execute on function private.is_assigned_clinician(uuid) to authenticated;

-- RLS is enabled on every application table. Clients can read only their own records
-- (or assigned cases for clinicians). All writes go through authenticated server APIs
-- that perform role, ownership, and transition checks. Never expose the service key.
alter table public.profiles enable row level security;
alter table public.intake_sessions enable row level security;
alter table public.patient_responses enable row level security;
alter table public.consultation_briefs enable row level security;
alter table public.brief_source_references enable row level security;
alter table public.consultation_cases enable row level security;
alter table public.clinician_revisions enable row level security;

create policy profiles_read_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy intake_sessions_read_owner_or_assigned_clinician on public.intake_sessions
  for select to authenticated using (
    patient_id = (select auth.uid())
    or (select private.is_assigned_clinician(intake_sessions.id))
  );

create policy patient_responses_read_owner_or_assigned_clinician on public.patient_responses
  for select to authenticated using (
    exists (
      select 1 from public.intake_sessions s
      where s.id = patient_responses.intake_session_id
        and s.patient_id = (select auth.uid())
    )
    or (select private.is_assigned_clinician(patient_responses.intake_session_id))
  );

create policy consultation_briefs_read_owner_or_assigned_clinician on public.consultation_briefs
  for select to authenticated using (
    exists (
      select 1 from public.intake_sessions s
      where s.id = consultation_briefs.intake_session_id
        and s.patient_id = (select auth.uid())
    )
    or (select private.is_assigned_clinician(consultation_briefs.intake_session_id))
  );

create policy brief_source_references_read_owner_or_assigned_clinician on public.brief_source_references
  for select to authenticated using (
    exists (
      select 1 from public.intake_sessions s
      where s.id = brief_source_references.intake_session_id
        and s.patient_id = (select auth.uid())
    )
    or (select private.is_assigned_clinician(brief_source_references.intake_session_id))
  );

create policy consultation_cases_read_owner_or_assigned_clinician on public.consultation_cases
  for select to authenticated using (
    exists (
      select 1 from public.intake_sessions s
      where s.id = consultation_cases.intake_session_id
        and s.patient_id = (select auth.uid())
    )
    or (
      assigned_clinician_id = (select auth.uid())
      and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'clinician')
    )
  );

create policy clinician_revisions_read_owner_or_assigned_clinician on public.clinician_revisions
  for select to authenticated using (
    exists (
      select 1 from public.consultation_cases c
      join public.intake_sessions s on s.id = c.intake_session_id
      where c.id = clinician_revisions.case_id
        and s.patient_id = (select auth.uid())
    )
    or exists (
      select 1 from public.consultation_cases c
      where c.id = clinician_revisions.case_id
        and (select private.is_assigned_clinician(c.intake_session_id))
    )
  );

-- No authenticated write policies are defined intentionally. Writes and transitions
-- are performed by server-side application code after verifying the user and record.
