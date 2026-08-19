create table if not exists public.acquisition_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trigger text not null default 'SCHEDULED',
  target_profile jsonb not null default '{}'::jsonb,
  discovered_count integer not null default 0,
  qualified_count integer not null default 0,
  draft_outreach_count integer not null default 0,
  status text not null default 'RUNNING',
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.delivery_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  client_company_id uuid references public.companies(id) on delete set null,
  name text not null,
  brief jsonb not null default '{}'::jsonb,
  status text not null default 'PLANNED',
  qa_status text not null default 'NOT_RUN',
  owner_review_status text not null default 'NOT_READY',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_artifacts (
  id uuid primary key default gen_random_uuid(),
  delivery_project_id uuid not null references public.delivery_projects(id) on delete cascade,
  artifact_type text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  qa_status text not null default 'PENDING',
  owner_approval_id uuid references public.approvals(id) on delete set null,
  external_delivery_status text not null default 'NOT_SENT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.autonomy_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mode text not null,
  status text not null default 'RUNNING',
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_acquisition_runs_recent on public.acquisition_runs(organization_id, started_at desc);
create index if not exists idx_delivery_projects_status on public.delivery_projects(organization_id, status, due_at);
create index if not exists idx_delivery_artifacts_review on public.delivery_artifacts(external_delivery_status, qa_status);
create index if not exists idx_autonomy_runs_recent on public.autonomy_runs(organization_id, started_at desc);

do $$ declare r record; begin for r in select tablename from pg_tables where schemaname='public' and tablename in ('acquisition_runs','delivery_projects','delivery_artifacts','autonomy_runs') loop execute format('alter table public.%I enable row level security',r.tablename); end loop; end $$;
